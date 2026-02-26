#!/bin/bash
# IntercomBounty - Quick Test Commands Reference

echo "==========================================="
echo "  IntercomBounty - Quick Command Reference"
echo "==========================================="
echo ""

cat << 'EOF'
## SETUP COMMANDS

# Start Admin/Poster Peer (Terminal 1)
pear run . --peer-store-name poster --msb-store-name poster-msb \
  --subnet-channel intercom-bounty

# Start Worker Peer (Terminal 2) - Replace <WRITER_KEY> with admin's key
pear run . --peer-store-name worker --msb-store-name worker-msb \
  --subnet-channel intercom-bounty \
  --subnet-bootstrap <WRITER_KEY>

# Start with SC-Bridge for Agents
pear run . --peer-store-name agent --msb-store-name agent-msb \
  --subnet-channel intercom-bounty \
  --subnet-bootstrap <WRITER_KEY> \
  --sc-bridge 1 --sc-bridge-token $(openssl rand -hex 32)

---

## POSTING BOUNTIES

# Helper command (generates TX)
/bounty_post --title "Your Title" --desc "Description here" --reward "5000000000000000000"

# Direct TX (5 TNK = 5000000000000000000 wei)
/tx --command '{"op":"post_bounty","title":"Build Calculator","description":"Create a JS calculator","reward":"5000000000000000000"}'

# Quick examples with different rewards:
# 1 TNK
/tx --command '{"op":"post_bounty","title":"Small Task","description":"Quick fix","reward":"1000000000000000000"}'

# 10 TNK
/tx --command '{"op":"post_bounty","title":"Medium Task","description":"Feature development","reward":"10000000000000000000"}'

# 100 TNK
/tx --command '{"op":"post_bounty","title":"Large Task","description":"Full project","reward":"100000000000000000000"}'

---

## VIEWING BOUNTIES

# List all bounties
/tx --command "list_bounties"

# View platform stats
/tx --command "stats"

# Your posted bounties
/tx --command "my_bounties"

# Your claimed work
/tx --command "my_work"

# Specific bounty
/bounty_get --id "bounty_1"
# Or direct:
/tx --command '{"op":"get_bounty","bountyId":"bounty_1"}'

---

## CLAIMING & WORKING

# Claim a bounty
/bounty_claim --id "bounty_1"
# Or direct:
/tx --command '{"op":"claim_bounty","bountyId":"bounty_1"}'

# Submit work
/bounty_submit --id "bounty_1" --proof "https://github.com/user/repo"
# Or direct:
/tx --command '{"op":"submit_work","bountyId":"bounty_1","proof":"https://github.com/user/repo"}'

---

## APPROVAL & REJECTION

# Approve work
/bounty_approve --id "bounty_1"
# Or direct:
/tx --command '{"op":"approve_bounty","bountyId":"bounty_1"}'

# Reject work
/bounty_reject --id "bounty_1" --reason "Incomplete implementation"
# Or direct:
/tx --command '{"op":"reject_bounty","bountyId":"bounty_1","reason":"Incomplete work"}'

# Cancel unclaimed bounty
/bounty_cancel --id "bounty_1"
# Or direct:
/tx --command '{"op":"cancel_bounty","bountyId":"bounty_1"}'

---

## DIRECT STATE QUERIES

# Get bounty counter
/get --key "bountyCounter"

# Get specific bounty
/get --key "bounties/bounty_1"

# Check index
/get --key "bountyIndex/open/bounty_1"
/get --key "bountyIndex/claimed/bounty_1"

# Check user bounties
/get --key "userBounties/trac1.../posted/bounty_1"

---

## SIDECHANNEL COMMANDS

# Join bounty feed
/sc_join --channel "bounty-feed"

# Send announcement
/sc_send --channel "bounty-feed" --message "New bounty: Build Calculator - 5 TNK"

# Create announcement with JSON
/sc_send --channel "bounty-feed" --message '{"action":"bounty_posted","id":"bounty_1","title":"Build Calculator","reward":"5 TNK"}'

# Check sidechannel stats
/sc_stats

---

## SYSTEM COMMANDS

# View peer info
/stats

# Check MSB balance
/msb

# Get help
/help

---

## TNK AMOUNT CONVERSION

1 TNK = 1,000,000,000,000,000,000 wei (10^18)

Quick reference:
- 0.01 TNK = 10000000000000000
- 0.1 TNK  = 100000000000000000
- 1 TNK    = 1000000000000000000
- 5 TNK    = 5000000000000000000
- 10 TNK   = 10000000000000000000
- 100 TNK  = 100000000000000000000

---

## WEBSOCKET API (SC-Bridge)

# Connect
ws://127.0.0.1:49222

# Authenticate (REQUIRED FIRST)
{"type":"auth","token":"YOUR_TOKEN"}

# Get peer info
{"type":"info"}

# Join channel
{"type":"join","channel":"bounty-feed"}

# Send message
{"type":"send","channel":"bounty-feed","message":{"action":"bounty_posted","id":"bounty_1"}}

# Get stats
{"type":"stats"}

---

## QUICK TEST SEQUENCE

1. Post bounty:    /tx --command '{"op":"post_bounty","title":"Test","description":"Testing","reward":"1000000000000000000"}'
2. List bounties:  /tx --command "list_bounties"
3. Claim (worker): /tx --command '{"op":"claim_bounty","bountyId":"bounty_1"}'
4. Submit (worker):/tx --command '{"op":"submit_work","bountyId":"bounty_1","proof":"https://test.com"}'
5. Approve:        /tx --command '{"op":"approve_bounty","bountyId":"bounty_1"}'
6. Check stats:    /tx --command "stats"

---

## CLEANUP

# Stop peers: Ctrl+C in each terminal

# Remove test stores
rm -rf stores/poster stores/worker stores/agent

# Clean all test stores
rm -rf stores/test-*

EOF

echo ""
echo "==========================================="
echo "Tip: Redirect this to a file for reference:"
echo "  ./demo-quick-commands.sh > commands.txt"
echo "==========================================="
