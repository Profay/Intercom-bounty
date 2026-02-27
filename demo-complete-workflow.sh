#!/bin/bash
# IntercomBounty Demo Script - Complete Workflow
# This script demonstrates the full bounty lifecycle

set -e

if [[ -t 1 ]]; then
	BOLD='\033[1m'
	DIM='\033[2m'
	CYAN='\033[36m'
	GREEN='\033[32m'
	YELLOW='\033[33m'
	RED='\033[31m'
	RESET='\033[0m'
else
	BOLD=''
	DIM=''
	CYAN=''
	GREEN=''
	YELLOW=''
	RED=''
	RESET=''
fi

print_header() {
	echo ""
	echo "${CYAN}${BOLD}============================================${RESET}"
	echo "${CYAN}${BOLD}$1${RESET}"
	echo "${CYAN}${BOLD}============================================${RESET}"
}

print_step() {
	echo ""
	echo "${BOLD}$1${RESET}"
}

print_cmd() {
	echo "${YELLOW}$1${RESET}"
}

wait_continue() {
	echo ""
	read -p "Press Enter to continue..."
}

print_header "  IntercomBounty - Live Demo Workflow"
echo ""
echo "${BOLD}This demo walks through:${RESET}"
echo "1) Posting a bounty"
echo "2) Claiming a bounty"
echo "3) Submitting work"
echo "4) Approving work"
echo "5) Releasing funds"
echo ""
echo "${BOLD}Prerequisites:${RESET}"
echo "- Two terminals open"
echo "- Admin peer running in Terminal 1"
echo "- Worker peer running in Terminal 2"
print_step "0) Validator Readiness Gate (must pass before real TX)"
echo "Run these in BOTH terminals and confirm validatorsConnected > 0:"
print_cmd "/doctor"
print_cmd "/msb"
echo ""
echo "${RED}If validatorsConnected = 0, STOP:${RESET} write TX and /deploy_subnet will fail."
echo "Use your validator network bootstrap settings, then re-check /doctor."
wait_continue

print_header "STEP 1: Post a Bounty (Terminal 1)"
echo ""
echo "Copy and paste this command in Terminal 1 (Poster):"
echo ""
print_cmd '/bounty_post --title "Build Simple Calculator" --desc "Create a JavaScript calculator with basic operations (+, -, *, /)" --reward "5000000000000000000"'
echo ""
echo "This will generate a TX command. Copy that command and run it."
wait_continue

print_header "STEP 2: View Available Bounties (Terminal 2)"
echo ""
echo "Copy and paste this command in Terminal 2 (Worker):"
echo ""
print_cmd '/tx --command "list_bounties"'
echo ""
echo "You should see bounty_1 with status 'open'"
wait_continue

print_header "STEP 3: Claim the Bounty (Terminal 2)"
echo ""
echo "Copy and paste in Terminal 2 (Worker):"
echo ""
print_cmd '/bounty_claim --id "bounty_1"'
echo ""
echo "Then run the generated TX command."
echo ""
echo "You should see: [IntercomBounty] Bounty claimed: bounty_1"
wait_continue

print_header "STEP 4: Verify Claim (Both Terminals)"
echo ""
echo "Run this command in BOTH terminals:"
echo ""
print_cmd '/tx --command "stats"'
echo ""
echo "Both should show: open: 0, claimed: 1"
wait_continue

print_header "STEP 5: Submit Work (Terminal 2)"
echo ""
echo "Worker completes the work and submits proof."
echo "Copy and paste in Terminal 2 (Worker):"
echo ""
print_cmd '/bounty_submit --id "bounty_1" --proof "https://github.com/worker-demo/calculator-app"'
echo ""
echo "Then run the generated TX command."
echo ""
echo "You should see: [IntercomBounty] Work submitted: bounty_1"
wait_continue

print_header "STEP 6: Review Submission (Terminal 1)"
echo ""
echo "Poster reviews the submitted work."
echo "Copy and paste in Terminal 1 (Poster):"
echo ""
print_cmd '/tx --command "list_bounties"'
echo ""
echo "You should see bounty_1 with status 'submitted'"
wait_continue

print_header "STEP 7: Approve Work (Terminal 1)"
echo ""
echo "Poster approves the submitted work."
echo "Copy and paste in Terminal 1 (Poster):"
echo ""
print_cmd '/bounty_approve --id "bounty_1"'
echo ""
echo "Then run the generated TX command."
echo ""
echo "You should see:"
echo "  [IntercomBounty] Bounty approved: bounty_1"
echo "  Run releaseFunds to execute payout for [worker address]"
wait_continue

print_header "STEP 8: Release Funds (Terminal 1)"
echo ""
echo "Copy and paste in Terminal 1 (Poster):"
echo ""
print_cmd '/bounty_release --id "bounty_1"'
echo ""
echo "Then run the generated TX command."
echo ""
echo "You should see:"
echo "  [IntercomBounty] Funds released: bounty_1"
echo "  Payment released: 5000000000000000000 TNK to [worker address]"
wait_continue

print_header "STEP 9: Verify Completion (Both Terminals)"
echo ""
echo "Run this command in BOTH terminals:"
echo ""
print_cmd '/tx --command "stats"'
echo ""
echo "Both should show: completed: 1"
echo ""
echo "Also run:"
echo ""
print_cmd '/tx --command "list_bounties"'
echo ""
echo "bounty_1 should show status 'completed'"
wait_continue

print_header "  Demo Complete! ✅"
echo ""
echo "${GREEN}Summary of what we demonstrated:${RESET}"
echo "✅ Posted a bounty with 5 TNK reward"
echo "✅ Worker claimed the bounty"
echo "✅ Worker submitted proof of work"
echo "✅ Poster approved submission"
echo "✅ Poster released escrowed payment"
echo "✅ State replicated across all peers"
echo ""
echo "${BOLD}Next steps:${RESET}"
echo "- Try the rejection workflow (demo-reject.sh)"
echo "- Test error handling (demo-errors.sh)"
echo "- Integrate with agents via SC-Bridge"
echo ""
echo "${DIM}For full testing suite, see TESTING.md${RESET}"
echo ""
