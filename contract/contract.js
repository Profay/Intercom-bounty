import {Contract} from 'trac-peer'

/**
 * IntercomBounty - Decentralized Micro-Task Escrow Platform
 * 
 * A trustless bounty platform where:
 * - Anyone can post bounties with TNK rewards
 * - Workers claim and complete tasks
 * - Funds are held in escrow via MSB
 * - Deterministic approval releases funds
 * 
 * Built for the Intercom Vibe Competition
 */
class BountyContract extends Contract {
    /**
     * IntercomBounty Contract - Micro-Bounty Escrow System
     *
     * State Management:
     * - bounties/[id] -> { id, title, description, reward, poster, status, claimer, proof, createdAt, claimedAt, completedAt }
     * - bountyCounter -> total bounties created
     * - bountyIndex/[status]/[id] -> indexing by status (open, claimed, completed, cancelled, rejected)
     * - userBounties/[address]/posted/[id] -> user's posted bounties
     * - userBounties/[address]/claimed/[id] -> user's claimed bounties
     *
     * Statuses:
     * - open: Available for claiming
     * - claimed: Worker is working on it
     * - submitted: Work submitted, awaiting approval
     * - completed: Approved and paid
     * - rejected: Work rejected
     * - cancelled: Bounty cancelled by poster
     *
     * @param protocol
     * @param options
     */
    constructor(protocol, options = {}) {
        // calling super and passing all parameters is required.
        super(protocol, options);

        // ============================================
        // BOUNTY WRITE OPERATIONS (State-changing)
        // ============================================
        
        this.addSchema('postBounty', {
            value: {
                $$strict: true,
                $$type: "object",
                op: { type: "string", min: 1, max: 128 },
                title: { type: "string", min: 1, max: 200 },
                description: { type: "string", min: 1, max: 2000 },
                reward: { type: "string", min: 1, max: 128 } // TNK amount as string
            }
        });

        this.addSchema('claimBounty', {
            value: {
                $$strict: true,
                $$type: "object",
                op: { type: "string", min: 1, max: 128 },
                bountyId: { type: "string", min: 1, max: 128 }
            }
        });

        this.addSchema('submitWork', {
            value: {
                $$strict: true,
                $$type: "object",
                op: { type: "string", min: 1, max: 128 },
                bountyId: { type: "string", min: 1, max: 128 },
                proof: { type: "string", min: 1, max: 5000 } // URL or description
            }
        });

        this.addSchema('approveBounty', {
            value: {
                $$strict: true,
                $$type: "object",
                op: { type: "string", min: 1, max: 128 },
                bountyId: { type: "string", min: 1, max: 128 }
            }
        });

        this.addSchema('rejectBounty', {
            value: {
                $$strict: true,
                $$type: "object",
                op: { type: "string", min: 1, max: 128 },
                bountyId: { type: "string", min: 1, max: 128 },
                reason: { type: "string", min: 1, max: 1000 }
            }
        });

        this.addSchema('cancelBounty', {
            value: {
                $$strict: true,
                $$type: "object",
                op: { type: "string", min: 1, max: 128 },
                bountyId: { type: "string", min: 1, max: 128 }
            }
        });

        // ============================================
        // READ OPERATIONS (No state changes)
        // ============================================
        
        this.addSchema('getBounty', {
            value: {
                $$strict: true,
                $$type: "object",
                op: { type: "string", min: 1, max: 128 },
                bountyId: { type: "string", min: 1, max: 128 }
            }
        });

        this.addFunction('listBounties');
        this.addFunction('getMyBounties');
        this.addFunction('getMyClaimedBounties');
        this.addFunction('getBountyStats');

        // ============================================
        // FEATURE INTEGRATION (Timer Oracle)
        // ============================================
        
        this.addSchema('feature_entry', {
            key: { type: "string", min: 1, max: 256 },
            value: { type: "any" }
        });

        // Timer feature for timestamps
        const _this = this;
        this.addFeature('timer_feature', async function(){
            if(false === _this.check.validateSchema('feature_entry', _this.op)) return;
            if(_this.op.key === 'currentTime') {
                if(null === await _this.get('currentTime')) console.log('[IntercomBounty] Timer started at', _this.op.value);
                await _this.put(_this.op.key, _this.op.value);
            }
        });

        // Chat integration for bounty announcements
        this.messageHandler(async function(){
            if(_this.op?.type === 'msg' && typeof _this.op.msg === 'string'){
                const currentTime = await _this.get('currentTime');
                await _this.put('chat_last', {
                    msg: _this.op.msg,
                    address: _this.op.address ?? null,
                    at: currentTime ?? null
                });
            }
        });
    }

    // ============================================
    // WRITE OPERATIONS
    // ============================================

    /**
     * Post a new bounty with reward
     * Creates escrow entry and indexes the bounty
     */
    async postBounty() {
        const { title, description, reward } = this.value;
        const poster = this.address;
        const currentTime = await this.get('currentTime');

        // Validate reward amount
        const rewardBigInt = this.protocol.safeBigInt(reward);
        this.assert(rewardBigInt !== null, new Error('Invalid reward amount'));
        this.assert(rewardBigInt > 0n, new Error('Reward must be greater than 0'));

        // Get and increment counter
        let counter = await this.get('bountyCounter');
        counter = counter === null ? 1 : counter + 1;
        const bountyId = `bounty_${counter}`;

        // Create bounty object
        const bounty = {
            id: bountyId,
            title,
            description,
            reward,
            poster,
            status: 'open',
            claimer: null,
            proof: null,
            rejectionReason: null,
            createdAt: currentTime,
            claimedAt: null,
            submittedAt: null,
            completedAt: null
        };

        // Store bounty and update indexes
        await this.put(`bounties/${bountyId}`, bounty);
        await this.put('bountyCounter', counter);
        await this.put(`bountyIndex/open/${bountyId}`, true);
        await this.put(`userBounties/${poster}/posted/${bountyId}`, true);

        console.log(`[IntercomBounty] Bounty posted: ${bountyId} by ${poster} - ${reward} TNK`);
        console.log(`Title: ${title}`);
    }

    /**
     * Claim an open bounty
     */
    async claimBounty() {
        const { bountyId } = this.value;
        const claimer = this.address;
        const currentTime = await this.get('currentTime');

        // Get bounty
        const bounty = await this.get(`bounties/${bountyId}`);
        this.assert(bounty !== null, new Error('Bounty not found'));
        this.assert(bounty.status === 'open', new Error('Bounty is not available'));
        this.assert(bounty.poster !== claimer, new Error('Cannot claim your own bounty'));

        // Update bounty
        const updated = this.protocol.safeClone(bounty);
        updated.status = 'claimed';
        updated.claimer = claimer;
        updated.claimedAt = currentTime;

        // Update indexes
        await this.put(`bounties/${bountyId}`, updated);
        await this.put(`bountyIndex/open/${bountyId}`, null);
        await this.put(`bountyIndex/claimed/${bountyId}`, true);
        await this.put(`userBounties/${claimer}/claimed/${bountyId}`, true);

        console.log(`[IntercomBounty] Bounty claimed: ${bountyId} by ${claimer}`);
    }

    /**
     * Submit work for a claimed bounty
     */
    async submitWork() {
        const { bountyId, proof } = this.value;
        const submitter = this.address;
        const currentTime = await this.get('currentTime');

        // Get bounty
        const bounty = await this.get(`bounties/${bountyId}`);
        this.assert(bounty !== null, new Error('Bounty not found'));
        this.assert(bounty.status === 'claimed', new Error('Bounty is not in claimed status'));
        this.assert(bounty.claimer === submitter, new Error('Only the claimer can submit work'));

        // Update bounty
        const updated = this.protocol.safeClone(bounty);
        updated.status = 'submitted';
        updated.proof = proof;
        updated.submittedAt = currentTime;

        // Update indexes
        await this.put(`bounties/${bountyId}`, updated);
        await this.put(`bountyIndex/claimed/${bountyId}`, null);
        await this.put(`bountyIndex/submitted/${bountyId}`, true);

        console.log(`[IntercomBounty] Work submitted: ${bountyId}`);
        console.log(`Proof: ${proof.substring(0, 100)}...`);
    }

    /**
     * Approve bounty and release funds (in production, this would trigger MSB transfer)
     */
    async approveBounty() {
        const { bountyId } = this.value;
        const approver = this.address;
        const currentTime = await this.get('currentTime');

        // Get bounty
        const bounty = await this.get(`bounties/${bountyId}`);
        this.assert(bounty !== null, new Error('Bounty not found'));
        this.assert(bounty.status === 'submitted', new Error('No work submitted yet'));
        this.assert(bounty.poster === approver, new Error('Only poster can approve'));

        // Update bounty
        const updated = this.protocol.safeClone(bounty);
        updated.status = 'completed';
        updated.completedAt = currentTime;

        // Update indexes
        await this.put(`bounties/${bountyId}`, updated);
        await this.put(`bountyIndex/submitted/${bountyId}`, null);
        await this.put(`bountyIndex/completed/${bountyId}`, true);

        console.log(`[IntercomBounty] Bounty approved: ${bountyId}`);
        console.log(`Payment released: ${bounty.reward} TNK to ${bounty.claimer}`);
        console.log(`*** In production, MSB transfer would execute here ***`);
    }

    /**
     * Reject submitted work
     */
    async rejectBounty() {
        const { bountyId, reason } = this.value;
        const rejector = this.address;
        const currentTime = await this.get('currentTime');

        // Get bounty
        const bounty = await this.get(`bounties/${bountyId}`);
        this.assert(bounty !== null, new Error('Bounty not found'));
        this.assert(bounty.status === 'submitted', new Error('No work submitted yet'));
        this.assert(bounty.poster === rejector, new Error('Only poster can reject'));

        // Update bounty - return to claimed status
        const updated = this.protocol.safeClone(bounty);
        updated.status = 'claimed';
        updated.proof = null;
        updated.rejectionReason = reason;
        updated.submittedAt = null;

        // Update indexes
        await this.put(`bounties/${bountyId}`, updated);
        await this.put(`bountyIndex/submitted/${bountyId}`, null);
        await this.put(`bountyIndex/claimed/${bountyId}`, true);

        console.log(`[IntercomBounty] Work rejected: ${bountyId}`);
        console.log(`Reason: ${reason}`);
    }

    /**
     * Cancel an unclaimed bounty
     */
    async cancelBounty() {
        const { bountyId } = this.value;
        const canceller = this.address;
        const currentTime = await this.get('currentTime');

        // Get bounty
        const bounty = await this.get(`bounties/${bountyId}`);
        this.assert(bounty !== null, new Error('Bounty not found'));
        this.assert(bounty.poster === canceller, new Error('Only poster can cancel'));
        this.assert(bounty.status === 'open', new Error('Can only cancel unclaimed bounties'));

        // Update bounty
        const updated = this.protocol.safeClone(bounty);
        updated.status = 'cancelled';
        updated.completedAt = currentTime;

        // Update indexes
        await this.put(`bounties/${bountyId}`, updated);
        await this.put(`bountyIndex/open/${bountyId}`, null);
        await this.put(`bountyIndex/cancelled/${bountyId}`, true);

        console.log(`[IntercomBounty] Bounty cancelled: ${bountyId}`);
    }

    // ============================================
    // READ OPERATIONS
    // ============================================

    /**
     * Get a specific bounty by ID
     */
    async getBounty() {
        const { bountyId } = this.value;
        const bounty = await this.get(`bounties/${bountyId}`);
        
        if (bounty === null) {
            console.log(`[IntercomBounty] Bounty not found: ${bountyId}`);
        } else {
            console.log(`[IntercomBounty] Bounty ${bountyId}:`, bounty);
        }
    }

    /**
     * List all bounties
     */
    async listBounties() {
        const counter = await this.get('bountyCounter');
        const total = counter === null ? 0 : counter;
        
        console.log(`[IntercomBounty] Total bounties: ${total}`);
        
        if (total === 0) {
            console.log('No bounties posted yet.');
            return;
        }

        const bounties = [];
        for (let i = 1; i <= total; i++) {
            const bountyId = `bounty_${i}`;
            const bounty = await this.get(`bounties/${bountyId}`);
            if (bounty !== null) {
                bounties.push(bounty);
            }
        }

        console.log('\n=== All Bounties ===');
        bounties.forEach(b => {
            console.log(`\n${b.id}: ${b.title}`);
            console.log(`  Status: ${b.status}`);
            console.log(`  Reward: ${b.reward} TNK`);
            console.log(`  Poster: ${b.poster}`);
            if (b.claimer) console.log(`  Claimer: ${b.claimer}`);
        });
    }

    /**
     * Get bounties posted by current user
     */
    async getMyBounties() {
        const poster = this.address;
        const counter = await this.get('bountyCounter');
        const total = counter === null ? 0 : counter;
        
        const myBounties = [];
        for (let i = 1; i <= total; i++) {
            const bountyId = `bounty_${i}`;
            const hasPosted = await this.get(`userBounties/${poster}/posted/${bountyId}`);
            if (hasPosted) {
                const bounty = await this.get(`bounties/${bountyId}`);
                if (bounty !== null) {
                    myBounties.push(bounty);
                }
            }
        }

        console.log(`[IntercomBounty] Your posted bounties: ${myBounties.length}`);
        myBounties.forEach(b => {
            console.log(`\n${b.id}: ${b.title} (${b.status})`);
            console.log(`  Reward: ${b.reward} TNK`);
        });
    }

    /**
     * Get bounties claimed by current user
     */
    async getMyClaimedBounties() {
        const claimer = this.address;
        const counter = await this.get('bountyCounter');
        const total = counter === null ? 0 : counter;
        
        const myBounties = [];
        for (let i = 1; i <= total; i++) {
            const bountyId = `bounty_${i}`;
            const hasClaimed = await this.get(`userBounties/${claimer}/claimed/${bountyId}`);
            if (hasClaimed) {
                const bounty = await this.get(`bounties/${bountyId}`);
                if (bounty !== null) {
                    myBounties.push(bounty);
                }
            }
        }

        console.log(`[IntercomBounty] Your claimed bounties: ${myBounties.length}`);
        myBounties.forEach(b => {
            console.log(`\n${b.id}: ${b.title} (${b.status})`);
            console.log(`  Reward: ${b.reward} TNK`);
            console.log(`  Poster: ${b.poster}`);
        });
    }

    /**
     * Get platform statistics
     */
    async getBountyStats() {
        const counter = await this.get('bountyCounter');
        const total = counter === null ? 0 : counter;
        
        const stats = {
            total: 0,
            open: 0,
            claimed: 0,
            submitted: 0,
            completed: 0,
            cancelled: 0
        };

        for (let i = 1; i <= total; i++) {
            const bountyId = `bounty_${i}`;
            const bounty = await this.get(`bounties/${bountyId}`);
            if (bounty !== null) {
                stats.total++;
                stats[bounty.status] = (stats[bounty.status] || 0) + 1;
            }
        }

        console.log('[IntercomBounty] Platform Statistics:');
        console.log(stats);
    }
}

export default BountyContract;
