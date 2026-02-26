import {Protocol} from "trac-peer";
import { bufferToBigInt, bigIntToDecimalString } from "trac-msb/src/utils/amountSerialization.js";
import b4a from "b4a";
import PeerWallet from "trac-wallet";
import fs from "fs";
import { createHash } from "trac-peer/src/utils/types.js";
import { MSB_OPERATION_TYPE } from "trac-peer/src/msbClient.js";

const READ_TX_TYPES = new Set(['listBounties', 'getMyBounties', 'getMyClaimedBounties', 'getBountyStats', 'getBounty']);

const stableStringify = (value) => {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

const normalizeInvitePayload = (payload) => {
    return {
        channel: String(payload?.channel ?? ''),
        inviteePubKey: String(payload?.inviteePubKey ?? '').trim().toLowerCase(),
        inviterPubKey: String(payload?.inviterPubKey ?? '').trim().toLowerCase(),
        inviterAddress: payload?.inviterAddress ?? null,
        issuedAt: Number(payload?.issuedAt),
        expiresAt: Number(payload?.expiresAt),
        nonce: String(payload?.nonce ?? ''),
        version: Number.isFinite(payload?.version) ? Number(payload.version) : 1,
    };
};

const normalizeWelcomePayload = (payload) => {
    return {
        channel: String(payload?.channel ?? ''),
        ownerPubKey: String(payload?.ownerPubKey ?? '').trim().toLowerCase(),
        text: String(payload?.text ?? ''),
        issuedAt: Number(payload?.issuedAt),
        version: Number.isFinite(payload?.version) ? Number(payload.version) : 1,
    };
};

const parseInviteArg = (raw) => {
    if (!raw) return null;
    let text = String(raw || '').trim();
    if (!text) return null;
    if (text.startsWith('@')) {
        try {
            text = fs.readFileSync(text.slice(1), 'utf8').trim();
        } catch (_e) {
            return null;
        }
    }
    if (text.startsWith('b64:')) text = text.slice(4);
    if (text.startsWith('{')) {
        try {
            return JSON.parse(text);
        } catch (_e) {}
    }
    try {
        const decoded = b4a.toString(b4a.from(text, 'base64'));
        return JSON.parse(decoded);
    } catch (_e) {}
    return null;
};

const parseWelcomeArg = (raw) => {
    if (!raw) return null;
    let text = String(raw || '').trim();
    if (!text) return null;
    if (text.startsWith('@')) {
        try {
            text = fs.readFileSync(text.slice(1), 'utf8').trim();
        } catch (_e) {
            return null;
        }
    }
    if (text.startsWith('b64:')) text = text.slice(4);
    if (text.startsWith('{')) {
        try {
            return JSON.parse(text);
        } catch (_e) {}
    }
    try {
        const decoded = b4a.toString(b4a.from(text, 'base64'));
        return JSON.parse(decoded);
    } catch (_e) {}
    return null;
};

/**
 * IntercomBounty Protocol - Command Mapping & API
 * Handles transaction routing and custom commands for the bounty platform
 */
class BountyProtocol extends Protocol{

    /**
     * Extending from Protocol inherits its capabilities and allows you to define your own protocol.
     * The protocol supports the corresponding contract. Both files come in pairs.
     *
     * Instances of this class do NOT run in contract context. The constructor is only called once on Protocol
     * instantiation.
     *
     * this.peer: an instance of the entire Peer class, the actual node that runs the contract and everything else.
     * this.base: the database engine, provides await this.base.view.get('key') to get unsigned data (not finalized data).
     * this.options: the option stack passed from Peer instance.
     *
     * @param peer
     * @param base
     * @param options
     */
    constructor(peer, base, options = {}) {
        // calling super and passing all parameters is required.
        super(peer, base, options);
    }

    /**
     * The Protocol superclass ProtocolApi instance already provides numerous api functions.
     * You can extend the built-in api based on your protocol requirements.
     *
     * @returns {Promise<void>}
     */
    async extendApi(){
        this.api.getSampleData = function(){
            return 'Some sample data';
        }
    }

    async tx(subject, sim = false, surrogate = null) {
        if (!subject || typeof subject.command !== 'string') {
            throw new Error('Missing option. Please use the --command flag.');
        }

        const mapped = this.mapTxCommand(subject.command);
        if (mapped === null || typeof mapped.type !== 'string' || mapped.value === undefined) {
            throw new Error('IntercomBounty: command not found. Run /help for available commands.');
        }

        const readCommand = READ_TX_TYPES.has(mapped.type);
        let runSim = sim === true;

        if (readCommand && !runSim) {
            console.log('[IntercomBounty] Read command detected. Running with simulation mode (--sim 1).');
            runSim = true;
        }

        if (!runSim && !readCommand) {
            const validators = this.peer?.msbClient?.getConnectedValidatorsCount?.() ?? 0;
            if (validators <= 0) {
                throw new Error('No connected MSB validators. TX would be dropped. Wait for validator connectivity, run /deploy_subnet, then /enable_transactions. For reads use --sim 1.');
            }
        }

        return await this.broadcastTransaction({
            type: mapped.type,
            value: mapped.value
        }, runSim, surrogate);
    }

    async broadcastTransaction(obj, sim = false, surrogate = null) {
        const txEnabled = await this.peer.base.view.get('txen');
        if (txEnabled !== null && txEnabled.value !== true) {
            throw new Error('Tx is not enabled. Run /enable_transactions first.');
        }
        if (this.peer.wallet.publicKey === null || this.peer.wallet.secretKey === null) {
            throw new Error('Wallet is not initialized.');
        }
        if (this.peer.writerLocalKey === null) {
            throw new Error('Local writer is not initialized.');
        }
        if (obj.type === undefined || obj.value === undefined) {
            throw new Error('Invalid transaction object.');
        }

        const validatorPubKey = '0'.repeat(64);
        if (sim === true) {
            return await this.simulateTransaction(validatorPubKey, obj, surrogate);
        }

        const txvHex = await this.peer.msbClient.getTxvHex();
        const msbBootstrapHex = this.peer.msbClient.bootstrapHex;
        const subnetBootstrapHex = (b4a.isBuffer(this.peer.config.bootstrap) ? this.peer.config.bootstrap.toString('hex') : ('' + this.peer.config.bootstrap)).toLowerCase();
        const contentHash = await createHash(this.safeJsonStringify(obj));

        let nonceHex;
        let txHex;
        let signatureHex;
        let pubKeyHex;

        if (surrogate !== null) {
            nonceHex = surrogate.nonce;
            txHex = surrogate.tx;
            signatureHex = surrogate.signature;
            pubKeyHex = surrogate.address;
        } else {
            nonceHex = this.generateNonce();
            txHex = await this.generateTx(
                this.peer.msbClient.networkId,
                txvHex,
                this.peer.writerLocalKey,
                contentHash,
                subnetBootstrapHex,
                msbBootstrapHex,
                nonceHex
            );
            signatureHex = this.peer.wallet.sign(b4a.from(txHex, 'hex'));
            pubKeyHex = this.peer.wallet.publicKey;
        }

        const address = this.peer.msbClient.pubKeyHexToAddress(pubKeyHex);
        if (address === null) {
            throw new Error('Failed to create MSB address from public key.');
        }

        const payload = {
            type: MSB_OPERATION_TYPE.TX,
            address,
            txo: {
                tx: txHex,
                txv: txvHex,
                iw: this.peer.writerLocalKey,
                in: nonceHex,
                ch: contentHash,
                is: signatureHex,
                bs: subnetBootstrapHex,
                mbs: msbBootstrapHex
            }
        };

        const broadcastResult = await this.peer.msbClient.broadcastTransaction(payload);
        const failedBroadcast =
            broadcastResult === false ||
            broadcastResult === null ||
            (typeof broadcastResult === 'object' && typeof broadcastResult.message === 'string' && /failed/i.test(broadcastResult.message));

        if (failedBroadcast) {
            throw new Error('MSB transaction broadcast failed. Ensure /deploy_subnet succeeded and validators are reachable.');
        }

        if (this.peer.txPool.isNotFull() && !this.peer.txPool.contains(txHex)) {
            this.peer.txPool.add(txHex, { dispatch: obj, ipk: pubKeyHex, address });
        }

        return payload;
    }

    /**
     * Map transaction commands to contract functions
     * IntercomBounty supports both simple commands and JSON payloads
     *
     * @param command
     * @returns {{type: string, value: *}|null}
     */
    mapTxCommand(command){
        // prepare the payload
        let obj = { type : '', value : null };
        
        // ============================================
        // BOUNTY OPERATIONS
        // ============================================
        // Simple read-only commands (no state changes)
        if (command === 'list_bounties') {
            obj.type = 'listBounties';
            obj.value = null;
            return obj;
        } else if (command === 'my_bounties') {
            obj.type = 'getMyBounties';
            obj.value = null;
            return obj;
        } else if (command === 'my_work') {
            obj.type = 'getMyClaimedBounties';
            obj.value = null;
            return obj;
        } else if (command === 'stats') {
            obj.type = 'getBountyStats';
            obj.value = null;
            return obj;
        } else {
            /*
            JSON-based bounty operations:
            Examples:
            
            Post bounty:
            /tx --command '{"op":"post_bounty","title":"Build calculator","description":"Create a simple calculator app","reward":"5000000000000000000"}'
            
            Claim bounty:
            /tx --command '{"op":"claim_bounty","bountyId":"bounty_1"}'
            
            Submit work:
            /tx --command '{"op":"submit_work","bountyId":"bounty_1","proof":"https://github.com/user/repo"}'
            
            Approve:
            /tx --command '{"op":"approve_bounty","bountyId":"bounty_1"}'
            
            Reject:
            /tx --command '{"op":"reject_bounty","bountyId":"bounty_1","reason":"Incomplete work"}'
            
            Read bounty:
            /tx --command '{"op":"get_bounty","bountyId":"bounty_1"}'
            */
            const json = this.safeJsonParse(command);
            
            if (json.op !== undefined) {
                switch(json.op) {
                    case 'post_bounty':
                        obj.type = 'postBounty';
                        obj.value = json;
                        return obj;
                    
                    case 'claim_bounty':
                        obj.type = 'claimBounty';
                        obj.value = json;
                        return obj;
                    
                    case 'submit_work':
                        obj.type = 'submitWork';
                        obj.value = json;
                        return obj;
                    
                    case 'approve_bounty':
                        obj.type = 'approveBounty';
                        obj.value = json;
                        return obj;
                    
                    case 'reject_bounty':
                        obj.type = 'rejectBounty';
                        obj.value = json;
                        return obj;
                    
                    case 'cancel_bounty':
                        obj.type = 'cancelBounty';
                        obj.value = json;
                        return obj;
                    
                    case 'get_bounty':
                        obj.type = 'getBounty';
                        obj.value = json;
                        return obj;
                    
                    default:
                        break;
                }
            }
        }
        // return null if no case matches.
        // if you do not return null, your protocol might behave unexpected.
        return null;
    }

    /**
     * Prints IntercomBounty commands for the interactive terminal
     *
     * @returns {Promise<void>}
     */
    async printOptions(){
        console.log(' ');
        console.log('=== IntercomBounty Menu ===');
        console.log('Quick start:');
        console.log('  /doctor');
        console.log('  /deploy_subnet');
        console.log('  /enable_transactions');
        console.log('  /bounty_post --title "Test" --desc "Demo" --reward "1000000000000000000"');
        console.log('  /tx --command "list_bounties" --sim 1');
        console.log('More: /examples, /help, /exit');
        console.log(' ');
    }

    /**
     * Extend the terminal system commands and execute your custom ones for your protocol.
     * This is not transaction execution itself (though can be used for it based on your requirements).
     * For transactions, use the built-in /tx command in combination with command mapping (see above)
     *
     * @param input
     * @returns {Promise<void>}
     */
    async customCommand(input) {
        await super.tokenizeInput(input);
        if (this.input.startsWith('/menu')) {
            await this.printOptions();
            return;
        }
        if (this.input.startsWith('/examples')) {
            console.log('Examples:');
            console.log('/bounty_post --title "Test Bounty" --desc "Testing bounty creation" --reward "1000000000000000000"');
            console.log('/tx --command \'{"op":"post_bounty","title":"Test Bounty","description":"Testing bounty creation","reward":"1000000000000000000"}\'');
            console.log('/tx --command "list_bounties" --sim 1');
            console.log('/tx --command "stats" --sim 1');
            console.log('/bounty_claim --id "bounty_1"');
            console.log('/bounty_submit --id "bounty_1" --proof "https://github.com/you/repo"');
            return;
        }
        if (this.input.startsWith('/doctor')) {
            const validators = this.peer?.msbClient?.getConnectedValidatorsCount?.() ?? 0;
            const txEnabledEntry = await this.peer.base.view.get('txen');
            const txEnabled = txEnabledEntry === null ? 'default(true)' : String(txEnabledEntry.value);
            const writable = this.peer?.base?.writable === true;
            const bootstrapHex = b4a.isBuffer(this.peer?.config?.bootstrap)
                ? this.peer.config.bootstrap.toString('hex')
                : String(this.peer?.config?.bootstrap ?? '').toLowerCase();
            const channelHex = b4a.isBuffer(this.peer?.config?.channel)
                ? this.peer.config.channel.toString('hex')
                : String(this.peer?.config?.channel ?? '');
            console.log({
                validatorsConnected: validators,
                txEnabled,
                writable,
                subnetBootstrap: bootstrapHex,
                subnetChannelHex: channelHex,
            });
            if (validators <= 0) {
                console.log('No validators connected: write TX may fail/drop.');
            }
            return;
        }
        if (this.input.startsWith("/get")) {
            const m = input.match(/(?:^|\s)--key(?:=|\s+)(\"[^\"]+\"|'[^']+'|\S+)/);
            const raw = m ? m[1].trim() : null;
            if (!raw) {
                console.log('Usage: /get --key "<hyperbee-key>" [--confirmed true|false] [--unconfirmed 1]');
                return;
            }
            const key = raw.replace(/^\"(.*)\"$/, "$1").replace(/^'(.*)'$/, "$1");
            const confirmedMatch = input.match(/(?:^|\s)--confirmed(?:=|\s+)(\S+)/);
            const unconfirmedMatch = input.match(/(?:^|\s)--unconfirmed(?:=|\s+)?(\S+)?/);
            const confirmed = unconfirmedMatch ? false : confirmedMatch ? confirmedMatch[1] === "true" || confirmedMatch[1] === "1" : true;
            const v = confirmed ? await this.getSigned(key) : await this.get(key);
            console.log(v);
            return;
        }
        if (this.input.startsWith("/msb")) {
            const txv = await this.peer.msbClient.getTxvHex();
            const peerMsbAddress = this.peer.msbClient.pubKeyHexToAddress(this.peer.wallet.publicKey);
            const entry = await this.peer.msbClient.getNodeEntryUnsigned(peerMsbAddress);
            const balance = entry?.balance ? bigIntToDecimalString(bufferToBigInt(entry.balance)) : 0;
            const feeBuf = this.peer.msbClient.getFee();
            const fee = feeBuf ? bigIntToDecimalString(bufferToBigInt(feeBuf)) : 0;
            const validators = this.peer.msbClient.getConnectedValidatorsCount();
            console.log({
                networkId: this.peer.msbClient.networkId,
                msbBootstrap: this.peer.msbClient.bootstrapHex,
                txv,
                msbSignedLength: this.peer.msbClient.getSignedLength(),
                msbUnsignedLength: this.peer.msbClient.getUnsignedLength(),
                connectedValidators: validators,
                peerMsbAddress,
                peerMsbBalance: balance,
                msbFee: fee,
            });
            return;
        }
        if (this.input.startsWith("/sc_join")) {
            const args = this.parseArgs(input);
            const name = args.channel || args.ch || args.name;
            const inviteArg = args.invite || args.invite_b64 || args.invitebase64;
            const welcomeArg = args.welcome || args.welcome_b64 || args.welcomebase64;
            if (!name) {
                console.log('Usage: /sc_join --channel "<name>" [--invite <json|b64|@file>] [--welcome <json|b64|@file>]');
                return;
            }
            if (!this.peer.sidechannel) {
                console.log('Sidechannel not initialized.');
                return;
            }
            let invite = null;
            if (inviteArg) {
                invite = parseInviteArg(inviteArg);
                if (!invite) {
                    console.log('Invalid invite. Pass JSON, base64, or @file.');
                    return;
                }
            }
            let welcome = null;
            if (welcomeArg) {
                welcome = parseWelcomeArg(welcomeArg);
                if (!welcome) {
                    console.log('Invalid welcome. Pass JSON, base64, or @file.');
                    return;
                }
            }
            if (invite || welcome) {
                this.peer.sidechannel.acceptInvite(String(name), invite, welcome);
            }
            const ok = await this.peer.sidechannel.addChannel(String(name));
            if (!ok) {
                console.log('Join denied (invite required or invalid).');
                return;
            }
            console.log('Joined sidechannel:', name);
            return;
        }
        if (this.input.startsWith("/sc_send")) {
            const args = this.parseArgs(input);
            const name = args.channel || args.ch || args.name;
            const message = args.message || args.msg;
            const inviteArg = args.invite || args.invite_b64 || args.invitebase64;
            const welcomeArg = args.welcome || args.welcome_b64 || args.welcomebase64;
            if (!name || message === undefined) {
                console.log('Usage: /sc_send --channel "<name>" --message "<text>" [--invite <json|b64|@file>] [--welcome <json|b64|@file>]');
                return;
            }
            if (!this.peer.sidechannel) {
                console.log('Sidechannel not initialized.');
                return;
            }
            let invite = null;
            if (inviteArg) {
                invite = parseInviteArg(inviteArg);
                if (!invite) {
                    console.log('Invalid invite. Pass JSON, base64, or @file.');
                    return;
                }
            }
            let welcome = null;
            if (welcomeArg) {
                welcome = parseWelcomeArg(welcomeArg);
                if (!welcome) {
                    console.log('Invalid welcome. Pass JSON, base64, or @file.');
                    return;
                }
            }
            if (invite || welcome) {
                this.peer.sidechannel.acceptInvite(String(name), invite, welcome);
            }
            const ok = await this.peer.sidechannel.addChannel(String(name));
            if (!ok) {
                console.log('Send denied (invite required or invalid).');
                return;
            }
            const sent = this.peer.sidechannel.broadcast(String(name), message, invite ? { invite } : undefined);
            if (!sent) {
                console.log('Send denied (owner-only or invite required).');
            }
            return;
        }
        if (this.input.startsWith("/sc_open")) {
            const args = this.parseArgs(input);
            const name = args.channel || args.ch || args.name;
            const via = args.via || args.channel_via;
            const inviteArg = args.invite || args.invite_b64 || args.invitebase64;
            const welcomeArg = args.welcome || args.welcome_b64 || args.welcomebase64;
            if (!name) {
                console.log('Usage: /sc_open --channel "<name>" [--via "<channel>"] [--invite <json|b64|@file>] [--welcome <json|b64|@file>]');
                return;
            }
            if (!this.peer.sidechannel) {
                console.log('Sidechannel not initialized.');
                return;
            }
            let invite = null;
            if (inviteArg) {
                invite = parseInviteArg(inviteArg);
                if (!invite) {
                    console.log('Invalid invite. Pass JSON, base64, or @file.');
                    return;
                }
            }
            let welcome = null;
            if (welcomeArg) {
                welcome = parseWelcomeArg(welcomeArg);
                if (!welcome) {
                    console.log('Invalid welcome. Pass JSON, base64, or @file.');
                    return;
                }
            } else if (typeof this.peer.sidechannel.getWelcome === 'function') {
                welcome = this.peer.sidechannel.getWelcome(String(name));
            }
            const viaChannel = via || this.peer.sidechannel.entryChannel || null;
            if (!viaChannel) {
                console.log('No entry channel configured. Pass --via "<channel>".');
                return;
            }
            this.peer.sidechannel.requestOpen(String(name), String(viaChannel), invite, welcome);
            console.log('Requested channel:', name);
            return;
        }
        if (this.input.startsWith("/sc_invite")) {
            const args = this.parseArgs(input);
            const channel = args.channel || args.ch || args.name;
            const invitee = args.pubkey || args.invitee || args.peer || args.key;
            const ttlRaw = args.ttl || args.ttl_sec || args.ttl_s;
            const welcomeArg = args.welcome || args.welcome_b64 || args.welcomebase64;
            if (!channel || !invitee) {
                console.log('Usage: /sc_invite --channel "<name>" --pubkey "<peer-pubkey-hex>" [--ttl <sec>] [--welcome <json|b64|@file>]');
                return;
            }
            if (!this.peer.sidechannel) {
                console.log('Sidechannel not initialized.');
                return;
            }
            if (this.peer?.wallet?.ready) {
                try {
                    await this.peer.wallet.ready;
                } catch (_e) {}
            }
            const walletPub = this.peer?.wallet?.publicKey;
            const inviterPubKey = walletPub
                ? typeof walletPub === 'string'
                    ? walletPub.trim().toLowerCase()
                    : b4a.toString(walletPub, 'hex')
                : null;
            if (!inviterPubKey) {
                console.log('Wallet not ready; cannot sign invite.');
                return;
            }
            let inviterAddress = null;
            try {
                if (this.peer?.msbClient) {
                    inviterAddress = this.peer.msbClient.pubKeyHexToAddress(inviterPubKey);
                }
            } catch (_e) {}
            const issuedAt = Date.now();
            let ttlMs = null;
            if (ttlRaw !== undefined) {
                const ttlSec = Number.parseInt(String(ttlRaw), 10);
                ttlMs = Number.isFinite(ttlSec) ? Math.max(ttlSec, 0) * 1000 : null;
            } else if (Number.isFinite(this.peer.sidechannel.inviteTtlMs) && this.peer.sidechannel.inviteTtlMs > 0) {
                ttlMs = this.peer.sidechannel.inviteTtlMs;
            } else {
                ttlMs = 0;
            }
            if (!ttlMs || ttlMs <= 0) {
                console.log('Invite TTL is required. Pass --ttl <sec> or set --sidechannel-invite-ttl.');
                return;
            }
            const expiresAt = issuedAt + ttlMs;
            const payload = normalizeInvitePayload({
                channel: String(channel),
                inviteePubKey: String(invitee).trim().toLowerCase(),
                inviterPubKey,
                inviterAddress,
                issuedAt,
                expiresAt,
                nonce: Math.random().toString(36).slice(2, 10),
                version: 1,
            });
            const message = stableStringify(payload);
            const msgBuf = b4a.from(message);
            let sig = this.peer.wallet.sign(msgBuf);
            let sigHex = '';
            if (typeof sig === 'string') {
                sigHex = sig;
            } else if (sig && sig.length > 0) {
                sigHex = b4a.toString(sig, 'hex');
            }
            if (!sigHex) {
                const walletSecret = this.peer?.wallet?.secretKey;
                const secretBuf = walletSecret
                    ? b4a.isBuffer(walletSecret)
                        ? walletSecret
                        : typeof walletSecret === 'string'
                            ? b4a.from(walletSecret, 'hex')
                            : b4a.from(walletSecret)
                    : null;
                if (secretBuf) {
                    const sigBuf = PeerWallet.sign(msgBuf, secretBuf);
                    if (sigBuf && sigBuf.length > 0) {
                        sigHex = b4a.toString(sigBuf, 'hex');
                    }
                }
            }
            let welcome = null;
            if (welcomeArg) {
                welcome = parseWelcomeArg(welcomeArg);
                if (!welcome) {
                    console.log('Invalid welcome. Pass JSON, base64, or @file.');
                    return;
                }
            } else if (typeof this.peer.sidechannel.getWelcome === 'function') {
                welcome = this.peer.sidechannel.getWelcome(String(channel));
            }
            const invite = { payload, sig: sigHex, welcome: welcome || undefined };
            const inviteJson = JSON.stringify(invite);
            const inviteB64 = b4a.toString(b4a.from(inviteJson), 'base64');
            if (!sigHex) {
                console.log('Failed to sign invite; wallet secret key unavailable.');
                return;
            }
            console.log(inviteJson);
            console.log('invite_b64:', inviteB64);
            return;
        }
        if (this.input.startsWith("/sc_welcome")) {
            const args = this.parseArgs(input);
            const channel = args.channel || args.ch || args.name;
            const text = args.text || args.message || args.msg;
            if (!channel || text === undefined) {
                console.log('Usage: /sc_welcome --channel "<name>" --text "<message>"');
                return;
            }
            if (!this.peer.sidechannel) {
                console.log('Sidechannel not initialized.');
                return;
            }
            if (this.peer?.wallet?.ready) {
                try {
                    await this.peer.wallet.ready;
                } catch (_e) {}
            }
            const walletPub = this.peer?.wallet?.publicKey;
            const ownerPubKey = walletPub
                ? typeof walletPub === 'string'
                    ? walletPub.trim().toLowerCase()
                    : b4a.toString(walletPub, 'hex')
                : null;
            if (!ownerPubKey) {
                console.log('Wallet not ready; cannot sign welcome.');
                return;
            }
            const payload = normalizeWelcomePayload({
                channel: String(channel),
                ownerPubKey,
                text: String(text),
                issuedAt: Date.now(),
                version: 1,
            });
            const message = stableStringify(payload);
            const msgBuf = b4a.from(message);
            let sig = this.peer.wallet.sign(msgBuf);
            let sigHex = '';
            if (typeof sig === 'string') {
                sigHex = sig;
            } else if (sig && sig.length > 0) {
                sigHex = b4a.toString(sig, 'hex');
            }
            if (!sigHex) {
                const walletSecret = this.peer?.wallet?.secretKey;
                const secretBuf = walletSecret
                    ? b4a.isBuffer(walletSecret)
                        ? walletSecret
                        : typeof walletSecret === 'string'
                            ? b4a.from(walletSecret, 'hex')
                            : b4a.from(walletSecret)
                    : null;
                if (secretBuf) {
                    const sigBuf = PeerWallet.sign(msgBuf, secretBuf);
                    if (sigBuf && sigBuf.length > 0) {
                        sigHex = b4a.toString(sigBuf, 'hex');
                    }
                }
            }
            if (!sigHex) {
                console.log('Failed to sign welcome; wallet secret key unavailable.');
                return;
            }
            const welcome = { payload, sig: sigHex };
            // Store the welcome in-memory so the owner peer can auto-send it to new connections
            // without requiring a restart (and so /sc_invite can embed it by default).
            try {
                this.peer.sidechannel.acceptInvite(String(channel), null, welcome);
            } catch (_e) {}
            const welcomeJson = JSON.stringify(welcome);
            const welcomeB64 = b4a.toString(b4a.from(welcomeJson), 'base64');
            console.log(welcomeJson);
            console.log('welcome_b64:', welcomeB64);
            return;
        }
        if (this.input.startsWith("/sc_stats")) {
            if (!this.peer.sidechannel) {
                console.log('Sidechannel not initialized.');
                return;
            }
            const channels = Array.from(this.peer.sidechannel.channels.keys());
            const connectionCount = this.peer.sidechannel.connections.size;
            console.log({ channels, connectionCount });
            return;
        }
        if (this.input.startsWith("/print")) {
            const splitted = this.parseArgs(input);
            console.log(splitted.text);
            return;
        }
        
        // ============================================
        // INTERCOM BOUNTY CUSTOM COMMANDS
        // ============================================
        
        if (this.input.startsWith("/bounty_post")) {
            const args = this.parseArgs(input);
            const title = args.title || args.t;
            const description = args.desc || args.description || args.d;
            const reward = args.reward || args.r;
            
            if (!title || !description || !reward) {
                console.log('Usage: /bounty_post --title "<title>" --desc "<description>" --reward "<amount>"');
                console.log('Example: /bounty_post --title "Build calculator" --desc "Simple JS calculator" --reward "5000000000000000000"');
                return;
            }
            
            const cmd = JSON.stringify({
                op: 'post_bounty',
                title: String(title),
                description: String(description),
                reward: String(reward)
            });
            
            console.log('Posting bounty...');
            console.log('Run this command to execute:');
            console.log(`/tx --command '${cmd}'`);
            return;
        }
        
        if (this.input.startsWith("/bounty_claim")) {
            const args = this.parseArgs(input);
            const bountyId = args.id || args.bounty;
            
            if (!bountyId) {
                console.log('Usage: /bounty_claim --id "<bountyId>"');
                console.log('Example: /bounty_claim --id "bounty_1"');
                return;
            }
            
            const cmd = JSON.stringify({
                op: 'claim_bounty',
                bountyId: String(bountyId)
            });
            
            console.log('Run this command to claim:');
            console.log(`/tx --command '${cmd}'`);
            return;
        }
        
        if (this.input.startsWith("/bounty_submit")) {
            const args = this.parseArgs(input);
            const bountyId = args.id || args.bounty;
            const proof = args.proof || args.p;
            
            if (!bountyId || !proof) {
                console.log('Usage: /bounty_submit --id "<bountyId>" --proof "<url_or_text>"');
                console.log('Example: /bounty_submit --id "bounty_1" --proof "https://github.com/user/repo"');
                return;
            }
            
            const cmd = JSON.stringify({
                op: 'submit_work',
                bountyId: String(bountyId),
                proof: String(proof)
            });
            
            console.log('Run this command to submit:');
            console.log(`/tx --command '${cmd}'`);
            return;
        }
        
        if (this.input.startsWith("/bounty_approve")) {
            const args = this.parseArgs(input);
            const bountyId = args.id || args.bounty;
            
            if (!bountyId) {
                console.log('Usage: /bounty_approve --id "<bountyId>"');
                return;
            }
            
            const cmd = JSON.stringify({
                op: 'approve_bounty',
                bountyId: String(bountyId)
            });
            
            console.log('Run this command to approve:');
            console.log(`/tx --command '${cmd}'`);
            return;
        }
        
        if (this.input.startsWith("/bounty_reject")) {
            const args = this.parseArgs(input);
            const bountyId = args.id || args.bounty;
            const reason = args.reason || args.r || 'Work does not meet requirements';
            
            if (!bountyId) {
                console.log('Usage: /bounty_reject --id "<bountyId>" --reason "<text>"');
                return;
            }
            
            const cmd = JSON.stringify({
                op: 'reject_bounty',
                bountyId: String(bountyId),
                reason: String(reason)
            });
            
            console.log('Run this command to reject:');
            console.log(`/tx --command '${cmd}'`);
            return;
        }
        
        if (this.input.startsWith("/bounty_cancel")) {
            const args = this.parseArgs(input);
            const bountyId = args.id || args.bounty;
            
            if (!bountyId) {
                console.log('Usage: /bounty_cancel --id "<bountyId>"');
                return;
            }
            
            const cmd = JSON.stringify({
                op: 'cancel_bounty',
                bountyId: String(bountyId)
            });
            
            console.log('Run this command to cancel:');
            console.log(`/tx --command '${cmd}'`);
            return;
        }
        
        if (this.input.startsWith("/bounty_get")) {
            const args = this.parseArgs(input);
            const bountyId = args.id || args.bounty;
            
            if (!bountyId) {
                console.log('Usage: /bounty_get --id "<bountyId>"');
                return;
            }
            
            const cmd = JSON.stringify({
                op: 'get_bounty',
                bountyId: String(bountyId)
            });
            
            console.log('Run this command to view:');
            console.log(`/tx --command '${cmd}' --sim 1`);
            return;
        }
    }
}

export default BountyProtocol;
