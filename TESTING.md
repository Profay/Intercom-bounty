# IntercomBounty Testing Guide

## Pre-Testing Checklist

Before starting tests, ensure:
- [ ] Node.js 22.x or 23.x installed (`node -v`)
- [ ] Pear runtime installed (`pear -v`)
- [ ] DHT bootstrap configured (`--dht-bootstrap 127.0.0.1:49737` or `export DHT_BOOTSTRAP=127.0.0.1:49737`)
- [ ] Dependencies installed (`npm install`)
- [ ] No other Intercom instances running on same ports

---

## Test Scenario 1: Single Peer Basic Operations

### Setup
```bash
# Start admin peer
pear run . --peer-store-name test-admin --msb-store-name test-admin-msb \
  --dht-bootstrap 127.0.0.1:49737 \
  --subnet-channel intercom-bounty-test

# In the peer prompt (>) run once before tests:
/deploy_subnet
/enable_transactions
```

### Tests to Run

#### Test 1.1: Post a Bounty
```bash
# Post bounty
/bounty_post --title "Test Bounty 1" --desc "Testing bounty creation" --reward "1000000000000000000"

# Copy the generated command and run it
/tx --command '{"op":"post_bounty","title":"Test Bounty 1","description":"Testing bounty creation","reward":"1000000000000000000"}'

# Expected output:
# MSB TX broadcasted: <tx-hash>
# [IntercomBounty] Bounty posted: bounty_1 by trac1... - 1000000000000000000 TNK
# Title: Test Bounty 1

# If you only see "MSB TX broadcasted", wait a few seconds and verify:
/tx --command "list_bounties" --sim 1
```

**✅ PASS if:** TX hash is returned and bounty_1 appears in list/stats shortly after

#### Test 1.2: List Bounties
```bash
/tx --command "list_bounties" --sim 1

# Expected output:
# [IntercomBounty] Total bounties: 1
# === All Bounties ===
# bounty_1: Test Bounty 1
#   Status: open
#   Reward: 1000000000000000000 TNK
#   Poster: trac1...
```

**✅ PASS if:** Shows 1 bounty with status "open"

#### Test 1.3: Get Bounty Stats
```bash
/tx --command "stats" --sim 1

# Expected output:
# [IntercomBounty] Platform Statistics:
# { total: 1, open: 1, claimed: 0, submitted: 0, completed: 0, cancelled: 0 }
```

**✅ PASS if:** Stats show total=1, open=1

#### Test 1.4: View My Bounties
```bash
/tx --command "my_bounties" --sim 1

# Expected output:
# [IntercomBounty] Your posted bounties: 1
# bounty_1: Test Bounty 1 (open)
#   Reward: 1000000000000000000 TNK
```

**✅ PASS if:** Shows your bounty

#### Test 1.5: Cancel Unclaimed Bounty
```bash
/bounty_cancel --id "bounty_1"
/tx --command '{"op":"cancel_bounty","bountyId":"bounty_1"}'

# Expected output:
# [IntercomBounty] Bounty cancelled: bounty_1

# Verify with stats
/tx --command "stats" --sim 1
# Should show: open: 0, cancelled: 1
```

**✅ PASS if:** Bounty status changes to cancelled

---

## Test Scenario 2: Multi-Peer Bounty Workflow

### Setup

**Terminal 1 - Admin (Poster):**
```bash
pear run . --peer-store-name poster --msb-store-name poster-msb \
  --dht-bootstrap 127.0.0.1:49737 \
  --subnet-channel intercom-bounty-test
```

**Terminal 2 - Worker:**
Wait for admin to start, then copy the **Peer Writer** key from admin's banner.

```bash
pear run . --peer-store-name worker --msb-store-name worker-msb \
  --dht-bootstrap 127.0.0.1:49737 \
  --subnet-channel intercom-bounty-test \
  --subnet-bootstrap <ADMIN_WRITER_KEY_HEX>
```

### Complete Workflow Tests

#### Test 2.1: Poster Creates Bounty
**In Terminal 1 (Poster):**
```bash
/bounty_post --title "Build Calculator" --desc "Simple JS calculator with basic operations" --reward "5000000000000000000"

# Run generated TX command
/tx --command '{"op":"post_bounty","title":"Build Calculator","description":"Simple JS calculator with basic operations","reward":"5000000000000000000"}'
```

**✅ PASS if:** Bounty bounty_1 created

#### Test 2.2: Worker Views Bounties
**In Terminal 2 (Worker):**
```bash
# Wait a few seconds for replication
/tx --command "list_bounties"

# Should see the posted bounty
```

**✅ PASS if:** Worker sees bounty_1 with status "open"

#### Test 2.3: Worker Claims Bounty
**In Terminal 2 (Worker):**
```bash
/bounty_claim --id "bounty_1"
/tx --command '{"op":"claim_bounty","bountyId":"bounty_1"}'

# Expected output:
# [IntercomBounty] Bounty claimed: bounty_1 by trac1...
```

**✅ PASS if:** Claim successful, claimer address shown

#### Test 2.4: Verify Claim (Both Peers)
**In Both Terminals:**
```bash
/tx --command "stats"
# Should show: open: 0, claimed: 1
```

**✅ PASS if:** Stats consistent on both peers

#### Test 2.5: Worker Submits Work
**In Terminal 2 (Worker):**
```bash
/bounty_submit --id "bounty_1" --proof "https://github.com/testuser/calculator-demo"
/tx --command '{"op":"submit_work","bountyId":"bounty_1","proof":"https://github.com/testuser/calculator-demo"}'

# Expected output:
# [IntercomBounty] Work submitted: bounty_1
# Proof: https://github.com/testuser/calculator-demo...
```

**✅ PASS if:** Submission recorded with proof

#### Test 2.6: Poster Approves Work
**In Terminal 1 (Poster):**
```bash
# Check submitted work
/tx --command "list_bounties"
# Should show bounty_1 with status "submitted"

# Approve
/bounty_approve --id "bounty_1"
/tx --command '{"op":"approve_bounty","bountyId":"bounty_1"}'

# Expected output:
# [IntercomBounty] Bounty approved: bounty_1
# Payment released: 5000000000000000000 TNK to trac1...
# *** In production, MSB transfer would execute here ***
```

**✅ PASS if:** Approval message shows, payment intent logged

#### Test 2.7: Verify Completion
**In Both Terminals:**
```bash
/tx --command "stats"
# Should show: completed: 1

/tx --command "list_bounties"
# bounty_1 should show status "completed"
```

**✅ PASS if:** Both peers show completed status

---

## Test Scenario 3: Error Handling

### Test 3.1: Can't Claim Own Bounty
```bash
# Poster tries to claim their own bounty
/bounty_claim --id "bounty_1"
/tx --command '{"op":"claim_bounty","bountyId":"bounty_1"}'

# Expected: Error message "Cannot claim your own bounty"
```

**✅ PASS if:** Error thrown, bounty remains unclaimed

### Test 3.2: Can't Claim Already Claimed Bounty
**Setup:** Have worker1 claim a bounty, then worker2 tries to claim same bounty

**Worker2:**
```bash
/tx --command '{"op":"claim_bounty","bountyId":"bounty_1"}'

# Expected: Error "Bounty is not available"
```

**✅ PASS if:** Second claim rejected

### Test 3.3: Only Claimer Can Submit
**Setup:** Worker1 claimed bounty, Worker2 tries to submit

**Worker2:**
```bash
/tx --command '{"op":"submit_work","bountyId":"bounty_1","proof":"fake proof"}'

# Expected: Error "Only the claimer can submit work"
```

**✅ PASS if:** Submission rejected

### Test 3.4: Only Poster Can Approve
**Setup:** Worker tries to approve their own submission

**Worker:**
```bash
/tx --command '{"op":"approve_bounty","bountyId":"bounty_1"}'

# Expected: Error "Only poster can approve"
```

**✅ PASS if:** Approval rejected

### Test 3.5: Can Only Cancel Unclaimed Bounty
**Setup:** Bounty is claimed

**Poster:**
```bash
/tx --command '{"op":"cancel_bounty","bountyId":"bounty_1"}'

# Expected: Error "Can only cancel unclaimed bounties"
```

**✅ PASS if:** Cancellation rejected

---

## Test Scenario 4: Rejection Workflow

### Setup
```bash
# Poster creates bounty (Terminal 1)
/tx --command '{"op":"post_bounty","title":"Test Rejection","description":"...","reward":"1000000000000000000"}'

# Worker claims (Terminal 2)
/tx --command '{"op":"claim_bounty","bountyId":"bounty_2"}'

# Worker submits poor work
/tx --command '{"op":"submit_work","bountyId":"bounty_2","proof":"incomplete work"}'
```

### Test 4.1: Poster Rejects Work
**Poster (Terminal 1):**
```bash
/bounty_reject --id "bounty_2" --reason "Work is incomplete, missing core features"
/tx --command '{"op":"reject_bounty","bountyId":"bounty_2","reason":"Work is incomplete, missing core features"}'

# Expected output:
# [IntercomBounty] Work rejected: bounty_2
# Reason: Work is incomplete, missing core features
```

**✅ PASS if:** Rejection recorded

### Test 4.2: Verify Status Returns to Claimed
```bash
/tx --command "list_bounties"
# bounty_2 should show status "claimed" (not submitted)

/tx --command "stats"
# Should show: claimed: 1, submitted: 0
```

**✅ PASS if:** Status reverted to claimed

### Test 4.3: Worker Can Resubmit
**Worker (Terminal 2):**
```bash
/tx --command '{"op":"submit_work","bountyId":"bounty_2","proof":"https://github.com/testuser/complete-work"}'

# Expected: Submission successful
```

**✅ PASS if:** Resubmission accepted

---

## Test Scenario 5: Sidechannel Integration

### Setup
```bash
# Start peer with sidechannel
pear run . --peer-store-name test-sc --msb-store-name test-sc-msb \
  --dht-bootstrap 127.0.0.1:49737 \
  --subnet-channel intercom-bounty-test \
  --sidechannels bounty-feed
```

### Test 5.1: Announce Bounty Creation
```bash
# Join bounty feed channel
/sc_join --channel "bounty-feed"

# Post bounty
/tx --command '{"op":"post_bounty","title":"SC Test","description":"...","reward":"1000000000000000000"}'

# Announce to channel
/sc_send --channel "bounty-feed" --message "New bounty posted: bounty_3 - SC Test - 1 TNK reward!"
```

**✅ PASS if:** Message sent to sidechannel

### Test 5.2: Query Sidechannel Stats
```bash
/sc_stats

# Expected output:
# { channels: ['bounty-feed'], connectionCount: X }
```

**✅ PASS if:** Shows bounty-feed channel

---

## Test Scenario 6: SC-Bridge (WebSocket) for Agents

### Setup
```bash
# Generate token
openssl rand -hex 32
# Example output: a1b2c3d4e5f6...

# Start peer with SC-Bridge
pear run . --peer-store-name agent-test --msb-store-name agent-test-msb \
  --dht-bootstrap 127.0.0.1:49737 \
  --subnet-channel intercom-bounty-test \
  --sc-bridge 1 \
  --sc-bridge-token a1b2c3d4e5f6...
```

### Test 6.1: WebSocket Connection (Node.js)
Create `test-ws.js`:
```javascript
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:49222');

ws.on('open', () => {
  console.log('Connected to SC-Bridge');
  
  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    token: 'a1b2c3d4e5f6...' // Your token
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('Received:', msg);
  
  if (msg.type === 'auth_ok') {
    console.log('✅ Authentication successful!');
    
    // Test: Get info
    ws.send(JSON.stringify({ type: 'info' }));
  }
  
  if (msg.type === 'info') {
    console.log('✅ Info received:', msg);
    ws.close();
  }
});

ws.on('error', (err) => {
  console.error('❌ Error:', err.message);
});
```

Run:
```bash
node test-ws.js
```

**✅ PASS if:** Authentication succeeds, info received

### Test 6.2: Join Channel via WebSocket
```javascript
// After auth_ok
ws.send(JSON.stringify({
  type: 'join',
  channel: 'bounty-feed'
}));

// Expected response:
// { type: 'joined', channel: 'bounty-feed' }
```

**✅ PASS if:** Join confirmation received

### Test 6.3: Send Message via WebSocket
```javascript
ws.send(JSON.stringify({
  type: 'send',
  channel: 'bounty-feed',
  message: {
    action: 'bounty_posted',
    bountyId: 'bounty_1',
    title: 'WebSocket Test Bounty',
    reward: '5 TNK'
  }
}));

// Expected response:
// { type: 'sent', channel: 'bounty-feed' }
```

**✅ PASS if:** Message sent successfully

---

## Test Scenario 7: State Consistency

### Test 7.1: Counter Increments Correctly
```bash
# Post 3 bounties
/tx --command '{"op":"post_bounty","title":"Bounty A","description":"...","reward":"1000000000000000000"}'
/tx --command '{"op":"post_bounty","title":"Bounty B","description":"...","reward":"2000000000000000000"}'
/tx --command '{"op":"post_bounty","title":"Bounty C","description":"...","reward":"3000000000000000000"}'

# Check state
/get --key "bountyCounter"
# Should return: 3

/tx --command "list_bounties"
# Should show: bounty_1, bounty_2, bounty_3
```

**✅ PASS if:** Counter matches total bounties

### Test 7.2: Index Consistency
```bash
# Check open index
/get --key "bountyIndex/open/bounty_1"
# Should return: true

# Claim bounty_1
/tx --command '{"op":"claim_bounty","bountyId":"bounty_1"}'

# Check indexes updated
/get --key "bountyIndex/open/bounty_1"
# Should return: null

/get --key "bountyIndex/claimed/bounty_1"
# Should return: true
```

**✅ PASS if:** Indexes update correctly

---

## Test Scenario 8: Large Numbers (BigInt)

### Test 8.1: Large Reward Amount
```bash
# Post bounty with 1000 TNK (10^21 wei)
/tx --command '{"op":"post_bounty","title":"Big Bounty","description":"Large reward test","reward":"1000000000000000000000"}'

# Verify it's stored correctly
/tx --command "list_bounties"
# Should show: Reward: 1000000000000000000000 TNK
```

**✅ PASS if:** Large number handled without overflow

---

## Performance Tests

### Test P1: Rapid Bounty Creation
```bash
# Post 10 bounties rapidly
for i in {1..10}; do
  /tx --command "{\"op\":\"post_bounty\",\"title\":\"Perf Test $i\",\"description\":\"Performance testing\",\"reward\":\"1000000000000000000\"}"
done

# Check stats
/tx --command "stats"
# Should show: total: 10
```

**✅ PASS if:** All bounties created successfully

### Test P2: List Performance
```bash
# With 10+ bounties in system
time /tx --command "list_bounties"

# Should complete in < 5 seconds
```

**✅ PASS if:** Query completes quickly

---

## Cleanup After Testing

```bash
# Stop all running peers (Ctrl+C)

# Remove test stores
rm -rf stores/test-*
rm -rf stores/poster
rm -rf stores/worker
rm -rf stores/agent-test
```

---

## Test Summary Checklist

- [ ] Scenario 1: Basic Operations (5 tests)
- [ ] Scenario 2: Multi-Peer Workflow (7 tests)
- [ ] Scenario 3: Error Handling (5 tests)
- [ ] Scenario 4: Rejection Workflow (3 tests)
- [ ] Scenario 5: Sidechannel Integration (2 tests)
- [ ] Scenario 6: SC-Bridge WebSocket (3 tests)
- [ ] Scenario 7: State Consistency (2 tests)
- [ ] Scenario 8: BigInt Handling (1 test)
- [ ] Performance Tests (2 tests)

**Total Tests: 30**

---

## Troubleshooting

### Issue: "Bounty not found"
- Check bountyId spelling
- Verify bounty was actually created (check with list_bounties)
- Ensure peers are synced (wait a few seconds)

### Issue: "Cannot claim your own bounty"
- Verify you're using different peers for poster/worker
- Check addresses with `/stats` command

### Issue: "Invalid signature" errors
- Ensure all peers are running the same contract version
- Clear stores and restart if contracts were modified

### Issue: WebSocket "Unauthorized"
- Check token matches between peer startup and WS client
- Ensure auth message is sent first
- Verify token format (no extra spaces/quotes)

### Issue: Peers not syncing
- Check subnet-bootstrap hex is correct
- Verify subnet-channel name matches
- Ensure network connectivity (try local DHT for testing)

---

## Expected Test Duration

- Scenario 1-4: ~15 minutes
- Scenario 5-6: ~10 minutes
- Scenario 7-8: ~5 minutes
- Performance: ~5 minutes
- **Total: ~35 minutes** for complete test suite
