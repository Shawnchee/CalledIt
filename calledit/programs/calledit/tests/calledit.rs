//! LiteSVM integration tests for CalledIt's named security/scoring invariants
//! (INV-1 … INV-7 from the threat model in `.solana-roast/`).
//!
//! These tests load the *compiled* program (`target/deploy/calledit.so`) into an
//! in-process SVM and drive it exactly like a real client would: they build raw
//! Anchor instructions (8-byte sighash discriminator + Borsh args), send signed
//! transactions, and assert on the concrete custom error codes / on-chain math.
//!
//! Run from `calledit/` with `cargo test` (matches `Anchor.toml`'s
//! `test = "cargo test"`). The tests do NOT link the on-chain crate, so they are
//! immune to any anchor-vs-litesvm dependency skew — the `.so` is the source of
//! truth, just like devnet.

use litesvm::types::TransactionResult;
use litesvm::LiteSVM;
use sha2::{Digest, Sha256};
use solana_clock::Clock;
use solana_instruction::{AccountMeta, Instruction};
use solana_instruction_error::InstructionError;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use solana_transaction::Transaction;
use solana_transaction_error::TransactionError;
use std::str::FromStr;

// ---------------------------------------------------------------------------
// Program facts (must mirror the source under programs/calledit/src/**).
// ---------------------------------------------------------------------------

/// Deployed program id (declare_id! in lib.rs).
const PROGRAM_ID_STR: &str = "BeR8b7y7c4offbz2fqNj2N1Y5zoEqkY9aYgBVc7NSdM1";
/// Canonical upgradeable BPF loader (owner of program + programdata accounts).
const BPF_LOADER_UPGRADEABLE_STR: &str = "BPFLoaderUpgradeab1e11111111111111111111111";

// PDA seeds (constants.rs).
const CONFIG_SEED: &[u8] = b"config";
const CALL_SEED: &[u8] = b"call";

// Sides / outcomes (constants.rs).
const SIDE_NO: u8 = 0;
const SIDE_YES: u8 = 1;
const OUTCOME_CORRECT: u8 = 1;
const OUTCOME_INCORRECT: u8 = 2;

// Anchor error numbers = 6000 + declaration index in error.rs (CalledItError).
const E_INVALID_SIDE: u32 = 6000;
const E_INVALID_MARKET_PCT: u32 = 6001;
const E_WINDOW_CLOSED: u32 = 6002;
const E_ALREADY_SETTLED: u32 = 6003;
const E_UNAUTHORIZED: u32 = 6004;

// CallReceipt byte layout: 8-byte account discriminator + Borsh fields.
//   8   player(32) match_id(8) prop_id(8) side(1) market_pct(2)
//   created_at(8) window_end(8) settled(1) outcome(1) points(4) bump(1) = 82 bytes
const OFF_SETTLED: usize = 75;
const OFF_OUTCOME: usize = 76;
const OFF_POINTS: usize = 77;
// Config byte layout: 8-byte discriminator + authority(32) + bump(1) = 41 bytes.
const OFF_CONFIG_AUTHORITY: usize = 8;

// ProgramData (UpgradeableLoaderState::ProgramData) metadata layout (bincode):
//   enum tag u32(4) + slot u64(8) + Option<Pubkey> tag(1) + Pubkey(32) = 45 bytes.
const PD_OPTION_TAG: usize = 12;
const PD_AUTHORITY_START: usize = 13;
const PD_METADATA_LEN: usize = 45;

/// A fixed "now" so window-vs-block-time logic is deterministic. LiteSVM's
/// default Clock has unix_timestamp = 0, which would make every future window
/// look closed; we pin a realistic epoch instead.
const NOW: i64 = 1_700_000_000;
const HOUR: i64 = 3_600;

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

fn program_id() -> Pubkey {
    Pubkey::from_str(PROGRAM_ID_STR).unwrap()
}

fn system_program() -> Pubkey {
    // The System program id ("111…11") is 32 zero bytes.
    Pubkey::default()
}

fn upgradeable_loader() -> Pubkey {
    Pubkey::from_str(BPF_LOADER_UPGRADEABLE_STR).unwrap()
}

fn so_path() -> String {
    // CARGO_MANIFEST_DIR = calledit/programs/calledit → workspace target is ../../target.
    format!(
        "{}/../../target/deploy/calledit.so",
        env!("CARGO_MANIFEST_DIR")
    )
}

/// Fresh SVM with the compiled program loaded and the clock pinned to `NOW`.
fn setup() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(program_id(), so_path())
        .expect("load calledit.so — run `anchor build` first if this fails");
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = NOW;
    svm.set_sysvar::<Clock>(&clock);
    svm
}

fn funded(svm: &mut LiteSVM) -> Keypair {
    let kp = Keypair::new();
    svm.airdrop(&kp.pubkey(), 1_000_000_000).unwrap(); // 1 SOL
    kp
}

/// First 8 bytes of sha256("global:<name>") — the Anchor instruction sighash.
fn ix_disc(name: &str) -> [u8; 8] {
    let mut h = Sha256::new();
    h.update(b"global:");
    h.update(name.as_bytes());
    let out = h.finalize();
    let mut d = [0u8; 8];
    d.copy_from_slice(&out[..8]);
    d
}

fn call_pda(player: &Pubkey, match_id: u64, prop_id: u64) -> Pubkey {
    Pubkey::find_program_address(
        &[
            CALL_SEED,
            player.as_ref(),
            &match_id.to_le_bytes(),
            &prop_id.to_le_bytes(),
        ],
        &program_id(),
    )
    .0
}

fn config_pda() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &program_id()).0
}

fn programdata_pda() -> Pubkey {
    Pubkey::find_program_address(&[program_id().as_ref()], &upgradeable_loader()).0
}

fn record_call_ix(
    player: &Pubkey,
    match_id: u64,
    prop_id: u64,
    side: u8,
    market_pct: u16,
    window_end: i64,
) -> Instruction {
    let mut data = ix_disc("record_call").to_vec();
    data.extend_from_slice(&match_id.to_le_bytes());
    data.extend_from_slice(&prop_id.to_le_bytes());
    data.push(side);
    data.extend_from_slice(&market_pct.to_le_bytes());
    data.extend_from_slice(&window_end.to_le_bytes());
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(call_pda(player, match_id, prop_id), false),
            AccountMeta::new(*player, true),
            AccountMeta::new_readonly(system_program(), false),
        ],
        data,
    }
}

fn settle_call_ix(call: Pubkey, authority: &Pubkey, correct: bool) -> Instruction {
    let mut data = ix_disc("settle_call").to_vec();
    data.push(correct as u8);
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new_readonly(config_pda(), false),
            AccountMeta::new(call, false),
            AccountMeta::new_readonly(*authority, true),
        ],
        data,
    }
}

fn initialize_config_ix(authority: &Pubkey) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(config_pda(), false),
            AccountMeta::new(*authority, true),
            AccountMeta::new_readonly(program_id(), false),
            AccountMeta::new_readonly(programdata_pda(), false),
            AccountMeta::new_readonly(system_program(), false),
        ],
        data: ix_disc("initialize_config").to_vec(),
    }
}

/// Sign (single signer == fee payer) and submit.
fn send(svm: &mut LiteSVM, ix: Instruction, signer: &Keypair) -> TransactionResult {
    let msg = Message::new(&[ix], Some(&signer.pubkey()));
    let tx = Transaction::new(&[signer], msg, svm.latest_blockhash());
    svm.send_transaction(tx)
}

/// Force the upgrade authority stored in the programdata account. LiteSVM's
/// `add_program` writes `upgrade_authority = None`; INV-7's passing case needs a
/// concrete authority. Patching only the metadata bytes (never the ELF) is safe:
/// the programdata account is non-executable, so LiteSVM won't reload the program.
fn set_upgrade_authority(svm: &mut LiteSVM, authority: &Pubkey) {
    let addr = programdata_pda();
    let mut pd = svm.get_account(&addr).expect("programdata account exists");
    assert!(pd.data.len() >= PD_METADATA_LEN, "unexpected programdata size");
    assert_eq!(&pd.data[0..4], &[3, 0, 0, 0], "not a ProgramData account");
    pd.data[PD_OPTION_TAG] = 1; // Option::Some
    pd.data[PD_AUTHORITY_START..PD_METADATA_LEN].copy_from_slice(&authority.to_bytes());
    svm.set_account(addr, pd).unwrap();
}

/// Bootstrap Config so settle_call can run. Returns the settlement authority.
fn init_config(svm: &mut LiteSVM) -> Keypair {
    let authority = funded(svm);
    set_upgrade_authority(svm, &authority.pubkey());
    let res = send(svm, initialize_config_ix(&authority.pubkey()), &authority);
    assert!(res.is_ok(), "initialize_config failed: {:#?}", err_of(&res));
    authority
}

fn err_of(res: &TransactionResult) -> String {
    match res {
        Ok(m) => format!("(unexpected success)\n{}", m.pretty_logs()),
        Err(f) => format!("{:?}\n{}", f.err, f.meta.pretty_logs()),
    }
}

/// Assert the tx failed with a specific Anchor custom error number.
fn assert_custom_error(res: TransactionResult, expected: u32) {
    match res {
        Ok(m) => panic!(
            "expected custom error {expected}, but tx succeeded.\n{}",
            m.pretty_logs()
        ),
        Err(f) => match f.err {
            TransactionError::InstructionError(_, InstructionError::Custom(code)) => {
                assert_eq!(
                    code,
                    expected,
                    "wrong custom error code (got {code}, want {expected}).\n{}",
                    f.meta.pretty_logs()
                );
            }
            other => panic!(
                "expected InstructionError::Custom({expected}), got {other:?}.\n{}",
                f.meta.pretty_logs()
            ),
        },
    }
}

/// Assert the tx failed because a PDA already exists ("account already in use").
fn assert_account_in_use(res: TransactionResult) {
    match res {
        Ok(m) => panic!(
            "expected 'already in use' failure, but tx succeeded.\n{}",
            m.pretty_logs()
        ),
        Err(f) => {
            let logs = f.meta.logs.join("\n").to_lowercase();
            assert!(
                logs.contains("already in use"),
                "expected an 'already in use' failure, got err={:?}\n{}",
                f.err,
                f.meta.pretty_logs()
            );
        }
    }
}

/// Read (settled, outcome, points) out of a CallReceipt account.
fn read_receipt(svm: &LiteSVM, call: &Pubkey) -> (bool, u8, u32) {
    let data = svm.get_account(call).expect("receipt exists").data;
    let settled = data[OFF_SETTLED] != 0;
    let outcome = data[OFF_OUTCOME];
    let points = u32::from_le_bytes(data[OFF_POINTS..OFF_POINTS + 4].try_into().unwrap());
    (settled, outcome, points)
}

/// Record a valid call (future window) and return its receipt PDA. Panics on failure.
fn record_ok(
    svm: &mut LiteSVM,
    player: &Keypair,
    match_id: u64,
    prop_id: u64,
    side: u8,
    market_pct: u16,
) -> Pubkey {
    let ix = record_call_ix(
        &player.pubkey(),
        match_id,
        prop_id,
        side,
        market_pct,
        NOW + HOUR,
    );
    let res = send(svm, ix, player);
    assert!(res.is_ok(), "record_call should succeed: {}", err_of(&res));
    call_pda(&player.pubkey(), match_id, prop_id)
}

// ---------------------------------------------------------------------------
// INV-1: a call whose window already closed is rejected (anti-hindsight).
// ---------------------------------------------------------------------------

#[test]
fn inv1_window_closed() {
    let mut svm = setup();
    let player = funded(&mut svm);
    // window_end in the PAST relative to the pinned clock.
    let ix = record_call_ix(&player.pubkey(), 1042026, 1, SIDE_YES, 2700, NOW - 100);
    assert_custom_error(send(&mut svm, ix, &player), E_WINDOW_CLOSED);
}

// ---------------------------------------------------------------------------
// INV-2 / INV-3: market_pct and side are validated at record time.
// ---------------------------------------------------------------------------

#[test]
fn inv2_market_pct_zero_rejected() {
    let mut svm = setup();
    let player = funded(&mut svm);
    let ix = record_call_ix(&player.pubkey(), 1042026, 10, SIDE_YES, 0, NOW + HOUR);
    assert_custom_error(send(&mut svm, ix, &player), E_INVALID_MARKET_PCT);
}

#[test]
fn inv2_market_pct_full_rejected() {
    let mut svm = setup();
    let player = funded(&mut svm);
    // 10_000 bps == 100% is out of the valid [1, 9999] range.
    let ix = record_call_ix(&player.pubkey(), 1042026, 11, SIDE_YES, 10_000, NOW + HOUR);
    assert_custom_error(send(&mut svm, ix, &player), E_INVALID_MARKET_PCT);
}

#[test]
fn inv3_invalid_side_rejected() {
    let mut svm = setup();
    let player = funded(&mut svm);
    // side must be 0 (NO) or 1 (YES); 2 is invalid.
    let ix = record_call_ix(&player.pubkey(), 1042026, 12, 2, 2700, NOW + HOUR);
    assert_custom_error(send(&mut svm, ix, &player), E_INVALID_SIDE);
}

// ---------------------------------------------------------------------------
// PDA uniqueness: the same (player, match, prop) can only be recorded once.
// ---------------------------------------------------------------------------

#[test]
fn pda_uniqueness_second_call_fails() {
    let mut svm = setup();
    let player = funded(&mut svm);
    // First call mints the receipt.
    let _ = record_ok(&mut svm, &player, 1042026, 3, SIDE_YES, 2700);
    // Second call to the same (player, match, prop) targets the same PDA. Vary a
    // non-seed field (market_pct) so the tx signature differs from the first —
    // the failure must come from the account already existing, not tx dedup.
    let dup = record_call_ix(&player.pubkey(), 1042026, 3, SIDE_YES, 5000, NOW + HOUR);
    assert_account_in_use(send(&mut svm, dup, &player));
}

// ---------------------------------------------------------------------------
// INV-6: only the config authority may settle (has_one gate).
// ---------------------------------------------------------------------------

#[test]
fn inv6_settle_by_non_authority_rejected() {
    let mut svm = setup();
    let authority = init_config(&mut svm);
    let player = funded(&mut svm);
    let call = record_ok(&mut svm, &player, 1042026, 4, SIDE_YES, 2700);

    let attacker = funded(&mut svm);
    // Attacker signs as the `authority` account; has_one(config.authority) fails.
    let ix = settle_call_ix(call, &attacker.pubkey(), true);
    assert_custom_error(send(&mut svm, ix, &attacker), E_UNAUTHORIZED);
    // Sanity: still unsettled.
    assert!(!read_receipt(&svm, &call).0);
    let _ = authority;
}

// ---------------------------------------------------------------------------
// INV-4: a call can only be settled once.
// ---------------------------------------------------------------------------

#[test]
fn inv4_double_settle_rejected() {
    let mut svm = setup();
    let authority = init_config(&mut svm);
    let player = funded(&mut svm);
    let call = record_ok(&mut svm, &player, 1042026, 5, SIDE_YES, 2700);

    // First settle succeeds.
    let first = send(&mut svm, settle_call_ix(call, &authority.pubkey(), true), &authority);
    assert!(first.is_ok(), "first settle failed: {}", err_of(&first));
    assert!(read_receipt(&svm, &call).0, "should be settled");

    // Second settle (differ `correct` so the tx signature differs) hits the
    // `!call.settled` constraint.
    let second = send(&mut svm, settle_call_ix(call, &authority.pubkey(), false), &authority);
    assert_custom_error(second, E_ALREADY_SETTLED);
}

// ---------------------------------------------------------------------------
// INV-5: on-chain scoring math (deterministic, authority can't inflate).
//   points = min(1_000_000 / prob_of_side_bps, 10_000); incorrect => 0.
// ---------------------------------------------------------------------------

#[test]
fn inv5_scoring_math() {
    let mut svm = setup();
    let authority = init_config(&mut svm);
    let player = funded(&mut svm);

    // (prop_id, side, market_pct, correct) -> (expected_points, expected_outcome)
    let cases: &[(u64, u8, u16, bool, u32, u8)] = &[
        // YES @ 2700 bps correct -> 1_000_000/2700 = 370 (mirrors the devnet +370 tx).
        (100, SIDE_YES, 2700, true, 370, OUTCOME_CORRECT),
        // YES @ 1200 bps correct -> 1_000_000/1200 = 833.
        (101, SIDE_YES, 1200, true, 833, OUTCOME_CORRECT),
        // NO @ 5200 bps correct -> prob_of_side = 10000-5200 = 4800 -> 208.
        (102, SIDE_NO, 5200, true, 208, OUTCOME_CORRECT),
        // YES @ 1 bp correct -> 1_000_000/1 = 1_000_000, capped to 10_000.
        (103, SIDE_YES, 1, true, 10_000, OUTCOME_CORRECT),
        // An incorrect call scores 0 and is marked outcome=2.
        (104, SIDE_YES, 2700, false, 0, OUTCOME_INCORRECT),
    ];

    for &(prop_id, side, market_pct, correct, want_points, want_outcome) in cases {
        let call = record_ok(&mut svm, &player, 1042026, prop_id, side, market_pct);
        let res = send(&mut svm, settle_call_ix(call, &authority.pubkey(), correct), &authority);
        assert!(res.is_ok(), "settle prop {prop_id} failed: {}", err_of(&res));

        let (settled, outcome, points) = read_receipt(&svm, &call);
        assert!(settled, "prop {prop_id} should be settled");
        assert_eq!(
            points, want_points,
            "prop {prop_id} (side={side} pct={market_pct} correct={correct}) points"
        );
        assert_eq!(outcome, want_outcome, "prop {prop_id} outcome");
    }
}

// ---------------------------------------------------------------------------
// INV-7: only the program's upgrade authority may bootstrap Config.
// ---------------------------------------------------------------------------

#[test]
fn inv7_initialize_config_requires_upgrade_authority() {
    // Failing case: LiteSVM's add_program leaves upgrade_authority = None, so
    // ANY signer differs from it -> Unauthorized.
    let mut svm = setup();
    let imposter = funded(&mut svm);
    let res = send(&mut svm, initialize_config_ix(&imposter.pubkey()), &imposter);
    assert_custom_error(res, E_UNAUTHORIZED);
    assert!(
        svm.get_account(&config_pda())
            .map(|a| a.data.is_empty())
            .unwrap_or(true),
        "config must not exist after a rejected init"
    );

    // Passing case: set the programdata upgrade authority to the signer.
    let mut svm = setup();
    let authority = funded(&mut svm);
    set_upgrade_authority(&mut svm, &authority.pubkey());
    let res = send(&mut svm, initialize_config_ix(&authority.pubkey()), &authority);
    assert!(res.is_ok(), "authorized init failed: {}", err_of(&res));

    let cfg = svm.get_account(&config_pda()).expect("config created");
    assert_eq!(
        &cfg.data[OFF_CONFIG_AUTHORITY..OFF_CONFIG_AUTHORITY + 32],
        &authority.pubkey().to_bytes(),
        "config.authority should equal the upgrade authority"
    );
}
