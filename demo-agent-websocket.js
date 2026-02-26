/**
 * IntercomBounty - WebSocket Agent Test Script
 * 
 * This script demonstrates how autonomous agents can interact with
 * IntercomBounty via the SC-Bridge WebSocket API.
 * 
 * Prerequisites:
 * - Peer running with --sc-bridge 1 --sc-bridge-token <TOKEN>
 * - npm install ws (or use built-in WebSocket in browser)
 */

import WebSocket from 'ws';

// Configuration
const WS_URL = 'ws://127.0.0.1:49222';
const AUTH_TOKEN = process.env.INTERCOM_TOKEN || 'YOUR_TOKEN_HERE'; // Set via env or replace

// Agent state
let authenticated = false;
let ws = null;

/**
 * Main agent workflow demonstration
 */
async function runAgentDemo() {
  console.log('🤖 IntercomBounty Agent Demo Starting...\n');
  
  // Connect to SC-Bridge
  ws = new WebSocket(WS_URL);
  
  ws.on('open', () => {
    console.log('✅ Connected to SC-Bridge');
    authenticate();
  });
  
  ws.on('message', (data) => {
    handleMessage(JSON.parse(data.toString()));
  });
  
  ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
  });
  
  ws.on('close', () => {
    console.log('🔌 Connection closed');
  });
}

/**
 * Authenticate with SC-Bridge
 */
function authenticate() {
  console.log('🔐 Authenticating...');
  send({ type: 'auth', token: AUTH_TOKEN });
}

/**
 * Handle incoming messages
 */
function handleMessage(msg) {
  console.log('📨 Received:', msg.type);
  
  switch (msg.type) {
    case 'hello':
      console.log('👋 Server hello received');
      console.log('   Peer:', msg.peer?.substring(0, 16) + '...');
      console.log('   Entry Channel:', msg.entryChannel);
      break;
      
    case 'auth_ok':
      console.log('✅ Authentication successful!\n');
      authenticated = true;
      runWorkflow();
      break;
      
    case 'error':
      console.error('❌ Error:', msg.error);
      break;
      
    case 'info':
      console.log('ℹ️  Peer Info:');
      console.log('   Trac Address:', msg.tracAddress);
      console.log('   Peer PubKey:', msg.peerPubKey?.substring(0, 32) + '...');
      console.log('   Subnet Channel:', msg.subnetChannel);
      console.log('   Subnet Bootstrap:', msg.subnetBootstrap?.substring(0, 32) + '...');
      break;
      
    case 'joined':
      console.log(`✅ Joined channel: ${msg.channel}`);
      break;
      
    case 'sent':
      console.log(`✅ Message sent to: ${msg.channel}`);
      break;
      
    case 'sidechannel_message':
      handleSidechannelMessage(msg);
      break;
      
    case 'stats':
      console.log('📊 Sidechannel Stats:');
      console.log('   Channels:', msg.channels);
      console.log('   Connections:', msg.connectionCount);
      break;
      
    default:
      console.log('📦 Unknown message type:', msg.type);
  }
}

/**
 * Handle sidechannel messages (bounty announcements, etc.)
 */
function handleSidechannelMessage(msg) {
  console.log(`💬 Sidechannel [${msg.channel}]:`, msg.message);
  
  // If message is bounty-related, parse it
  if (typeof msg.message === 'object') {
    const { action, bountyId, title, reward } = msg.message;
    
    switch (action) {
      case 'bounty_posted':
        console.log(`   🎯 New bounty: ${bountyId} - ${title} (${reward})`);
        // Agent could auto-evaluate and claim here
        break;
        
      case 'bounty_claimed':
        console.log(`   👷 Bounty claimed: ${bountyId}`);
        break;
        
      case 'work_submitted':
        console.log(`   📤 Work submitted: ${bountyId}`);
        break;
        
      case 'bounty_completed':
        console.log(`   ✅ Bounty completed: ${bountyId}`);
        break;
    }
  }
}

/**
 * Main agent workflow
 */
async function runWorkflow() {
  console.log('🚀 Starting agent workflow...\n');
  
  // Step 1: Get peer info
  console.log('Step 1: Getting peer info...');
  send({ type: 'info' });
  await sleep(1000);
  
  // Step 2: Join bounty feed channel
  console.log('\nStep 2: Joining bounty-feed channel...');
  send({ type: 'join', channel: 'bounty-feed' });
  await sleep(1000);
  
  // Step 3: Subscribe to listen for bounties
  console.log('\nStep 3: Subscribing to bounty announcements...');
  send({ type: 'subscribe', channels: ['bounty-feed'] });
  await sleep(1000);
  
  // Step 4: Announce presence
  console.log('\nStep 4: Announcing agent presence...');
  send({
    type: 'send',
    channel: 'bounty-feed',
    message: {
      action: 'agent_online',
      agentType: 'bounty-worker',
      capabilities: ['javascript', 'python', 'documentation'],
      timestamp: Date.now()
    }
  });
  await sleep(1000);
  
  // Step 5: Simulate bounty announcement
  console.log('\nStep 5: Simulating bounty announcement (for demo)...');
  send({
    type: 'send',
    channel: 'bounty-feed',
    message: {
      action: 'bounty_posted',
      bountyId: 'bounty_1',
      title: 'Build Simple Calculator',
      description: 'Create a JavaScript calculator with basic operations',
      reward: '5 TNK',
      poster: 'Agent Demo'
    }
  });
  await sleep(1000);
  
  // Step 6: Get stats
  console.log('\nStep 6: Getting sidechannel stats...');
  send({ type: 'stats' });
  await sleep(2000);
  
  // Done
  console.log('\n✅ Agent workflow demo complete!');
  console.log('\n💡 Agent is now listening for bounty announcements...');
  console.log('   Press Ctrl+C to exit\n');
  
  // Keep connection alive to listen for messages
  // In production, agent would continuously monitor and respond
}

/**
 * Send message to SC-Bridge
 */
function send(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  } else {
    console.error('❌ WebSocket not open');
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Example: Agent claims a bounty
 */
function exampleClaimBounty(bountyId) {
  console.log(`🎯 Agent claiming bounty: ${bountyId}`);
  
  // In production, this would use the CLI command feature
  // For now, just announce the intent
  send({
    type: 'send',
    channel: 'bounty-feed',
    message: {
      action: 'bounty_claimed',
      bountyId: bountyId,
      worker: 'Agent Demo',
      timestamp: Date.now()
    }
  });
}

/**
 * Example: Agent submits work
 */
function exampleSubmitWork(bountyId, proof) {
  console.log(`📤 Agent submitting work for: ${bountyId}`);
  
  send({
    type: 'send',
    channel: 'bounty-feed',
    message: {
      action: 'work_submitted',
      bountyId: bountyId,
      proof: proof,
      worker: 'Agent Demo',
      timestamp: Date.now()
    }
  });
}

// Run the demo
runAgentDemo();

/**
 * USAGE:
 * 
 * 1. Start IntercomBounty peer with SC-Bridge:
 *    pear run . --peer-store-name agent --msb-store-name agent-msb \
 *      --subnet-channel intercom-bounty \
 *      --sc-bridge 1 --sc-bridge-token $(openssl rand -hex 32)
 * 
 * 2. Set the token:
 *    export INTERCOM_TOKEN="<token-from-above>"
 * 
 * 3. Run this script:
 *    node demo-agent-websocket.js
 * 
 * The agent will:
 * - Connect to SC-Bridge
 * - Authenticate
 * - Join bounty-feed channel
 * - Listen for bounty announcements
 * - Demonstrate bounty workflow
 */
