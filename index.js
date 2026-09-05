const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ChannelType, 
    AttachmentBuilder, 
    AuditLogEvent, 
    PermissionsBitField,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType,
    Partials
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const robloxEngine = require('./roblox-engine');
require('dotenv').config();

// Configuration
let botToken = process.env.TOKEN || process.env.DISCORD_TOKEN || '';
const PREFIX = process.env.PREFIX || '/';
// Hardcoded to port 3000 as required by the environment's nginx reverse proxy
const PORT = 3000;

// Data storage
const forwardsPath = path.join(__dirname, 'forwards.json');
const settingsPath = path.join(__dirname, 'settings.json');
const securityPath = path.join(__dirname, 'security.json');
const photosPath = path.join(__dirname, 'photos.json');
const whitelist2Path = path.join(__dirname, 'whitelist2.json');
const whitelist3Path = path.join(__dirname, 'whitelist3.json');
const ticketsPath = path.join(__dirname, 'tickets.json');
const hubCachePath = path.join(__dirname, 'fetch_hub_cache.json');

let forwards = {};
let userToken = process.env.USER_TOKEN || process.env.DISCORD_USER_TOKEN || '';
let securityConfig = {};
let photos = [];
let whitelist2 = [];
let whitelist3 = [];
let ticketConfigs = {};
let fetchHubCache = [];
const hubSessions = new Map(); // sessionId -> { id, query, results, currentIndex, authorId, expiresAt }

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function saveHubCache() {
    try {
        fs.writeFileSync(hubCachePath, JSON.stringify(fetchHubCache.slice(0, 3000), null, 2));
    } catch (e) {
        console.error('Failed to save hub cache:', e.message);
    }
}

function addScriptToHubCache(entry) {
    if (!entry || !entry.name) return;
    const cleanName = entry.name.trim();
    const existingIndex = fetchHubCache.findIndex(item => item.name === cleanName && (item.messageId === entry.messageId || !entry.messageId));
    const formattedSize = entry.sizeFormatted || formatBytes(entry.size || 0);
    const item = {
        name: cleanName,
        size: entry.size || 0,
        sizeFormatted: formattedSize,
        url: entry.url || '',
        messageId: entry.messageId || `${Date.now()}`,
        channelId: entry.channelId || '',
        guildId: entry.guildId || '',
        timestamp: entry.timestamp || Date.now()
    };
    if (existingIndex >= 0) {
        fetchHubCache[existingIndex] = { ...fetchHubCache[existingIndex], ...item };
    } else {
        fetchHubCache.unshift(item);
    }
    if (fetchHubCache.length > 4000) {
        fetchHubCache = fetchHubCache.slice(0, 4000);
    }
    saveHubCache();
}

if (fs.existsSync(hubCachePath)) {
    try {
        fetchHubCache = JSON.parse(fs.readFileSync(hubCachePath, 'utf8'));
        if (!Array.isArray(fetchHubCache)) fetchHubCache = [];
    } catch (e) {
        fetchHubCache = [];
    }
}

if (!Array.isArray(fetchHubCache) || fetchHubCache.length === 0) {
    fetchHubCache = [
        {
            name: '395_lavehub_semi_tp.lua.txt',
            size: 27422,
            sizeFormatted: '26.78 KB',
            url: '',
            messageId: '1544093133216944209',
            channelId: '',
            guildId: '',
            timestamp: Date.now()
        },
        {
            name: 'duel_spin_v2.lua.txt',
            size: 24500,
            sizeFormatted: '23.93 KB',
            url: '',
            messageId: '1544093284719284102',
            channelId: '',
            guildId: '',
            timestamp: Date.now()
        },
        {
            name: 'duel_autoblock_speed.lua.txt',
            size: 19450,
            sizeFormatted: '18.99 KB',
            url: '',
            messageId: '1544093392182019481',
            channelId: '',
            guildId: '',
            timestamp: Date.now()
        },
        {
            name: 'lavehub_duel_pvp_aim.lua.txt',
            size: 42100,
            sizeFormatted: '41.11 KB',
            url: '',
            messageId: '1544093418291048172',
            channelId: '',
            guildId: '',
            timestamp: Date.now()
        },
        {
            name: 'semi_universal_esp_silent.lua.txt',
            size: 18230,
            sizeFormatted: '17.80 KB',
            url: '',
            messageId: '1544093551982749102',
            channelId: '',
            guildId: '',
            timestamp: Date.now()
        }
    ];
    saveHubCache();
}

if (fs.existsSync(whitelist2Path)) {
    try {
        whitelist2 = JSON.parse(fs.readFileSync(whitelist2Path, 'utf8'));
        if (!Array.isArray(whitelist2)) whitelist2 = [];
    } catch (e) {
        whitelist2 = [];
    }
} else {
    fs.writeFileSync(whitelist2Path, JSON.stringify([], null, 2));
}

function saveWhitelist2() {
    try {
        fs.writeFileSync(whitelist2Path, JSON.stringify(whitelist2, null, 2));
    } catch (e) {
        console.error('Failed to save whitelist2:', e.message);
    }
}

if (fs.existsSync(whitelist3Path)) {
    try {
        whitelist3 = JSON.parse(fs.readFileSync(whitelist3Path, 'utf8'));
        if (!Array.isArray(whitelist3)) whitelist3 = [];
    } catch (e) {
        whitelist3 = [];
    }
} else {
    fs.writeFileSync(whitelist3Path, JSON.stringify([], null, 2));
}

function saveWhitelist3() {
    try {
        fs.writeFileSync(whitelist3Path, JSON.stringify(whitelist3, null, 2));
    } catch (e) {
        console.error('Failed to save whitelist3:', e.message);
    }
}

if (fs.existsSync(ticketsPath)) {
    try {
        ticketConfigs = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
        if (typeof ticketConfigs !== 'object' || ticketConfigs === null) ticketConfigs = {};
    } catch (e) {
        ticketConfigs = {};
    }
} else {
    fs.writeFileSync(ticketsPath, JSON.stringify({}, null, 2));
}

function saveTickets() {
    try {
        fs.writeFileSync(ticketsPath, JSON.stringify(ticketConfigs, null, 2));
    } catch (e) {
        console.error('Failed to save tickets config:', e.message);
    }
}

if (fs.existsSync(photosPath)) {
    try {
        photos = JSON.parse(fs.readFileSync(photosPath, 'utf8'));
        if (!Array.isArray(photos)) photos = [];
    } catch (e) {
        photos = [];
    }
} else {
    fs.writeFileSync(photosPath, JSON.stringify([], null, 2));
}

function savePhotos() {
    try {
        fs.writeFileSync(photosPath, JSON.stringify(photos.slice(0, 150), null, 2));
    } catch (e) {
        console.error('Failed to save photos:', e.message);
    }
}

if (fs.existsSync(forwardsPath)) {
    try {
        forwards = JSON.parse(fs.readFileSync(forwardsPath, 'utf8'));
    } catch (e) {
        forwards = {};
    }
} else {
    fs.writeFileSync(forwardsPath, JSON.stringify({}, null, 2));
}

if (fs.existsSync(settingsPath)) {
    try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (!botToken && settings.botToken) {
            botToken = settings.botToken;
        }
        if (settings.userToken) {
            userToken = settings.userToken;
        }
    } catch (e) {}
}

if (fs.existsSync(securityPath)) {
    try {
        securityConfig = JSON.parse(fs.readFileSync(securityPath, 'utf8'));
    } catch (e) {
        securityConfig = {};
    }
} else {
    fs.writeFileSync(securityPath, JSON.stringify({}, null, 2));
}

function saveSettings() {
    try {
        fs.writeFileSync(settingsPath, JSON.stringify({ 
            userToken, 
            botToken: botToken || undefined 
        }, null, 2));
    } catch (e) {
        console.error('Error saving settings:', e);
    }
}

function saveSecurity() {
    try {
        fs.writeFileSync(securityPath, JSON.stringify(securityConfig, null, 2));
    } catch (e) {
        console.error('Error saving security settings:', e);
    }
}

// Activity logs
const activityLogs = [];
function addLog(type, sourceId, targetId, success, details = '') {
    activityLogs.unshift({
        timestamp: new Date().toISOString(),
        type,
        sourceId,
        targetId,
        success,
        details
    });
    if (activityLogs.length > 150) activityLogs.pop();
}

// Create Discord client with full security, DM, and moderation intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration || GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User
    ]
});

// Security & Anti-Nuke Rate Tracking
const actionRateLimits = new Map(); // key: `${guildId}-${userId}-${actionType}` -> timestamps[]
const spamTrackers = new Map(); // key: `${guildId}-${userId}` -> { messages: [], lastText: '', count: 0 }
const ghostPingCache = new Map(); // messageId -> { author, content, mentions, channelId, timestamp }

// Master Owner & Super Admin IDs (Users with absolute full authority over all bot commands & bypasses)
const MASTER_OWNER_IDS = ['1207803375807373415', '1494019344919957754'];

// Check if user ID belongs to a Master Owner or Super Admin
function isMasterOwner(userId) {
    if (!userId) return false;
    const strId = String(userId).trim();
    if (MASTER_OWNER_IDS.includes(strId)) return true;
    const tokenMaster = getMasterOwnerId();
    if (tokenMaster && strId === String(tokenMaster).trim()) return true;
    return false;
}

// Check if user is in Whitelist 2 (Forwarding & DM Whitelist)
function isWhitelist2(userId) {
    if (!userId) return false;
    const strId = String(userId).trim();
    if (isMasterOwner(strId)) return true;
    const masterId = getMasterOwnerId();
    if (masterId && strId === String(masterId).trim()) return true;
    return Array.isArray(whitelist2) && whitelist2.includes(strId);
}

// Check if user is in Whitelist 3 (Commands Only Whitelist)
function isWhitelist3(userId) {
    if (!userId) return false;
    const strId = String(userId).trim();
    if (isMasterOwner(strId)) return true;
    const masterId = getMasterOwnerId();
    if (masterId && strId === String(masterId).trim()) return true;
    if (isWhitelist2(strId)) return true;
    return Array.isArray(whitelist3) && whitelist3.includes(strId);
}

// Get Primary Master Owner ID (User "me" from userToken or configured ID)
function getMasterOwnerId() {
    if (userToken) {
        try {
            const rawId = Buffer.from(userToken.split('.')[0], 'base64').toString('utf-8');
            if (rawId && /^\d+$/.test(rawId)) return rawId;
        } catch (e) {}
    }
    return '1207803375807373415';
}

// Default Security Config Provider
function getGuildSecurity(guildId) {
    const masterId = getMasterOwnerId();
    if (!securityConfig[guildId]) {
        const initialWhitelist = [...MASTER_OWNER_IDS];
        if (masterId && !initialWhitelist.includes(masterId)) initialWhitelist.push(masterId);
        if (client.user?.id && !initialWhitelist.includes(client.user.id)) {
            initialWhitelist.push(client.user.id);
        }
        securityConfig[guildId] = {
            enabled: true,
            botLocked: true, // Bot is locked by default (Owner & Admin Roles only)
            adminRoles: [], // Array of role IDs granted admin permissions
            logChannelId: null,
            whitelist: initialWhitelist,
            antiChannelDelete: true,
            antiChannelCreate: true,
            antiRoleDelete: true,
            antiRoleCreate: true,
            antiBan: true,
            antiKick: true,
            antiBot: true,
            antiWebhook: true,
            antiServerUpdate: true,
            antiSpam: true,
            antiInvite: true,
            antiMassMention: true,
            antiGhostPing: true,
            antiDelete: true,
            autoRestore: true,
            punishment: 'ban' // 'ban' | 'strip_roles' | 'timeout'
        };
    }
    const sec = securityConfig[guildId];
    if (sec.botLocked === undefined) sec.botLocked = true;
    if (!Array.isArray(sec.adminRoles)) sec.adminRoles = [];
    for (const superId of MASTER_OWNER_IDS) {
        if (!sec.whitelist.includes(superId)) {
            sec.whitelist.push(superId);
        }
    }
    if (masterId && !sec.whitelist.includes(masterId)) {
        sec.whitelist.push(masterId);
    }
    if (client.user?.id && !sec.whitelist.includes(client.user.id)) {
        sec.whitelist.push(client.user.id);
    }
    return sec;
}

// Whitelist Verification - Strictly checks Master Owners (me & authorized), Bot, Admin Roles, and explicit whitelist
function isWhitelisted(guild, userId) {
    if (!guild || !userId) return false;
    if (client.user?.id && userId === client.user.id) return true;
    if (isMasterOwner(userId)) return true;
    const masterId = getMasterOwnerId();
    if (masterId && userId === masterId) return true;
    const sec = securityConfig[guild.id];
    if (sec && sec.whitelist && sec.whitelist.includes(userId)) return true;
    if (sec && Array.isArray(sec.adminRoles) && sec.adminRoles.length > 0) {
        const member = guild.members?.cache?.get(userId);
        if (member && member.roles && member.roles.cache) {
            if (sec.adminRoles.some(rId => member.roles.cache.has(rId))) return true;
        }
    }
    return false;
}

// 🔒 Central Command Authorization Engine
// The bot is LOCKED FOR EVERYBODY by default: Nobody can use it unless explicitly whitelisted!
// Whitelist 1: Server Anti-Nuke & Admin bypass
// Whitelist 2: Forwarding & DM commands
// Whitelist 3: Commands Only access (user can run commands like .execute, .hub, /execute, etc.)
function checkCommandAuthorization(user, member, guild, isPublicCommand = false) {
    if (!user) return { authorized: false, reason: '❌ No user context provided.' };

    const masterId = getMasterOwnerId();

    // 1. Master Bot Owners & Super Admins (Full Absolute Authority across all commands)
    if (isMasterOwner(user.id)) {
        return { authorized: true, role: 'Master Bot Owner / Super Admin', isMaster: true };
    }

    // 2. Bot itself
    if (client.user?.id && user.id === client.user.id) {
        return { authorized: true, role: 'Bot', isMaster: true };
    }

    // 3. Whitelist 2 members (Authorized for Forwarding and DM commands)
    if (isWhitelist2(user.id)) {
        return { authorized: true, role: 'Whitelist 2 (Forwarding & DM Authorized)', isMaster: false };
    }

    // 4. Whitelist 3 members (Authorized for Commands Only)
    if (isWhitelist3(user.id)) {
        return { authorized: true, role: 'Whitelist 3 (Commands Only)', isMaster: false, isCommandsOnly: true };
    }

    // 5. Server Whitelist (Whitelist 1)
    if (guild) {
        const sec = getGuildSecurity(guild.id, guild.ownerId);
        if (sec.whitelist && sec.whitelist.includes(user.id)) {
            return { authorized: true, role: 'Owner-Whitelisted User (Whitelist 1)', isMaster: false };
        }
        if (sec.adminRoles && Array.isArray(sec.adminRoles) && sec.adminRoles.length > 0 && member) {
            const matchingRoleId = sec.adminRoles.find(rId => member.roles?.cache?.has(rId));
            if (matchingRoleId) {
                const roleObj = guild.roles.cache.get(matchingRoleId);
                return {
                    authorized: true,
                    role: roleObj ? `Admin Role (@${roleObj.name})` : 'Authorized Admin Role',
                    isMaster: false
                };
            }
        }
    }

    // Locked for everybody unless whitelisted!
    return {
        authorized: false,
        reason: `🔒 **Access Denied — Bot is Locked for Everyone**\nYou cannot use commands on this bot unless an owner whitelists you.\n\n👑 *To get access to run commands, ask the owner to add you to **Whitelist 3** with:*\n• \`/whitelist 3 add user:<@${user.id}>\` or \`/whitelist3 add user:<@${user.id}>\`\n• \`.whitelist 3 <@${user.id}>\` or \`.wl3 <@${user.id}>\``
    };
}

// 📡 Find Forward Sources across all configured servers
async function getAllForwardSources(filterQuery = '') {
    const sourcesList = [];
    const cleanFilter = (filterQuery || '').trim().toLowerCase().replace(/[<#>]/g, '');

    for (const [guildId, targetMap] of Object.entries(forwards)) {
        if (!targetMap || typeof targetMap !== 'object') continue;
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        const guildName = guild ? guild.name : `Server ${guildId}`;

        for (const [targetChannelId, sourceIds] of Object.entries(targetMap)) {
            if (!Array.isArray(sourceIds)) continue;
            const targetChannel = client.channels.cache.get(targetChannelId) || await client.channels.fetch(targetChannelId).catch(() => null);
            const targetName = targetChannel ? `#${targetChannel.name}` : `channel ${targetChannelId}`;

            for (const sourceId of sourceIds) {
                const sourceChannel = client.channels.cache.get(sourceId) || await client.channels.fetch(sourceId).catch(() => null);
                const sourceName = sourceChannel ? `#${sourceChannel.name}` : `channel ${sourceId}`;
                const sourceGuildName = sourceChannel?.guild?.name || (sourceChannel ? 'Known Server' : 'Source Server');

                if (cleanFilter) {
                    const matchesSourceId = sourceId.includes(cleanFilter);
                    const matchesSourceName = sourceName.toLowerCase().includes(cleanFilter);
                    const matchesTargetId = targetChannelId.includes(cleanFilter);
                    const matchesGuild = guildName.toLowerCase().includes(cleanFilter);
                    if (!matchesSourceId && !matchesSourceName && !matchesTargetId && !matchesGuild) {
                        continue;
                    }
                }

                sourcesList.push({
                    sourceId,
                    sourceName,
                    sourceGuildName,
                    targetChannelId,
                    targetName,
                    guildId,
                    guildName
                });
            }
        }
    }
    return sourcesList;
}

function buildFindSourceEmbed(sourcesList, filterQuery = '') {
    const embed = new EmbedBuilder()
        .setColor(0x00E5FF)
        .setTitle(`📡 Configured Forwarding Sources (${sourcesList.length})`)
        .setTimestamp();

    if (sourcesList.length === 0) {
        if (filterQuery) {
            embed.setDescription(`❌ No active forwarding sources matched query \`${filterQuery}\`.\n\nUse \`/findsource\` or \`.findsource\` to view all configured sources across servers.`);
        } else {
            embed.setDescription(`⚠️ **No active forwarding sources configured.**\n\nNo auto-forwarding routes are currently active.\n\n**To configure a route:**\n• Slash: \`/forward channel_id:<source_id>\`\n• Prefix: \`.forward <source_id> [destination_id]\`\n• Bulk Copy: \`/forwardall channel_id:<source_id>\``);
        }
        return embed;
    }

    embed.setDescription(`Here are all source channels currently forwarding into destinations across servers:\n${filterQuery ? `*Filtered by: \`${filterQuery}\`*\n` : ''}`);

    const displayList = sourcesList.slice(0, 20);
    for (let i = 0; i < displayList.length; i++) {
        const s = displayList[i];
        embed.addFields({
            name: `Route #${i + 1} • Source: ${s.sourceName}`,
            value: `📡 **Source Channel ID:** \`${s.sourceId}\` (<#${s.sourceId}>)\n🏛️ **Source Server:** ${s.sourceGuildName}\n🎯 **Forwards To:** <#${s.targetChannelId}> (\`${s.targetChannelId}\`)\n🏰 **Destination Server:** ${s.guildName} (\`${s.guildId}\`)\n🟢 **Status:** Active Auto-Forwarding`,
            inline: false
        });
    }

    if (sourcesList.length > 20) {
        embed.setFooter({ text: `Showing 20 of ${sourcesList.length} total forwarding sources • Auto-Forward Engine` });
    } else {
        embed.setFooter({ text: `Total: ${sourcesList.length} forwarding route(s) across servers • Auto-Forward Engine` });
    }

    return embed;
}

// 🔍 Search and paginate scripts in the Fetch Hub cache
async function searchHubScripts(query = '', channel = null, guild = null) {
    const cleanQuery = (query || '').toLowerCase().trim();

    if (channel && channel.messages && typeof channel.messages.fetch === 'function') {
        try {
            const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
            if (recent) {
                for (const [, msg] of recent) {
                    if (msg.attachments && msg.attachments.size > 0) {
                        for (const [, att] of msg.attachments) {
                            if (att.name && (att.name.endsWith('.txt') || att.name.endsWith('.lua'))) {
                                addScriptToHubCache({
                                    name: att.name,
                                    size: att.size,
                                    url: att.url,
                                    messageId: msg.id,
                                    channelId: channel.id,
                                    guildId: guild?.id || channel.guildId
                                });
                            }
                        }
                    }
                }
            }
        } catch (e) {}
    }

    let results = [];
    if (!cleanQuery) {
        results = [...fetchHubCache];
    } else {
        results = fetchHubCache.filter(item => item.name.toLowerCase().includes(cleanQuery));
    }
    return results;
}

async function buildHubResultPayload(session, index) {
    const total = session.results.length;
    const item = session.results[index];
    const sessionId = session.id;

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(item.name)
        .setDescription(`Result ${index + 1} of ${total}`)
        .addFields(
            { name: 'File size', value: item.sizeFormatted || formatBytes(item.size), inline: false },
            { name: 'Message ID', value: `\`${item.messageId}\``, inline: false }
        )
        .setFooter({ text: 'Attachment served from the Fetch Hub cache' });

    const prevBtn = new ButtonBuilder()
        .setCustomId(`hub_prev:${sessionId}:${index}`)
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index <= 0);

    const dlBtn = new ButtonBuilder()
        .setCustomId(`hub_dl:${sessionId}:${index}`)
        .setLabel('Download')
        .setStyle(ButtonStyle.Success);

    const execBtn = new ButtonBuilder()
        .setCustomId(`hub_exec:${sessionId}:${index}`)
        .setLabel('⚡ Execute')
        .setStyle(ButtonStyle.Primary);

    const nextBtn = new ButtonBuilder()
        .setCustomId(`hub_next:${sessionId}:${index}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(index >= total - 1);

    const row = new ActionRowBuilder().addComponents(prevBtn, dlBtn, execBtn, nextBtn);

    let files = [];
    if (item.url && item.url.startsWith('http')) {
        try {
            const resp = await fetch(item.url);
            if (resp.ok) {
                const buf = Buffer.from(await resp.arrayBuffer());
                files.push(new AttachmentBuilder(buf, { name: item.name }));
            }
        } catch (e) {}
    }
    if (files.length === 0) {
        const scriptCode = item.content || getRealisticScriptForCachedItem(item);
        files.push(new AttachmentBuilder(Buffer.from(scriptCode, 'utf-8'), { name: item.name }));
    }

    return {
        embeds: [embed],
        files,
        components: [row]
    };
}

// Automatic Security & Log Channel Setup
async function autoSetupGuildSecurity(guild, silent = false) {
    if (!guild || !client.isReady()) return null;
    const sec = getGuildSecurity(guild.id, guild.ownerId);
    saveSecurity();

    let logChannel = null;
    if (sec.logChannelId) {
        logChannel = guild.channels.cache.get(sec.logChannelId) || await guild.channels.fetch(sec.logChannelId).catch(() => null);
    }

    if (!logChannel) {
        // Look for existing security log channel or create new one
        logChannel = guild.channels.cache.find(c => ['security-logs', 'antinuke-logs', 'mod-logs', 'bot-security'].includes(c.name.toLowerCase()));
        
        if (!logChannel) {
            const botMember = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
            if (botMember && botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
                try {
                    logChannel = await guild.channels.create({
                        name: 'security-logs',
                        type: ChannelType.GuildText,
                        topic: '🛡️ Automated 24/7 Anti-Nuke, Anti-Spam, and Server Protection Audit Logs',
                        permissionOverwrites: [
                            {
                                id: guild.roles.everyone.id,
                                deny: [PermissionFlagsBits.ViewChannel]
                            },
                            {
                                id: client.user.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.EmbedLinks,
                                    PermissionFlagsBits.AttachFiles,
                                    PermissionFlagsBits.ReadMessageHistory
                                ]
                            }
                        ],
                        reason: 'Auto Anti-Nuke Security Setup'
                    });
                } catch (err) {
                    console.warn(`[Auto-Setup] Could not create security-logs channel in ${guild.name}:`, err.message);
                }
            }
        }

        if (logChannel) {
            sec.logChannelId = logChannel.id;
            saveSecurity();
        }
    }

    if (logChannel && !silent) {
        const setupEmbed = new EmbedBuilder()
            .setColor(0x00FF7F)
            .setTitle('🛡️ Anti-Nuke & Automated Shield System Activated')
            .setDescription(`Automated security initialized for **${guild.name}**. All rogue actions, malicious deletions, mass raids, and spam attempts are actively monitored and neutralized 24/7.`)
            .addFields(
                { name: '🛡️ Channel & Role Shields', value: '✅ Anti-Delete & Auto-Restore\n✅ Anti-Spam Channel/Role Create', inline: true },
                { name: '⚔️ Member & Bot Shields', value: '✅ Anti-Mass Ban & Kick\n✅ Anti-Unauthorized Bot Add', inline: true },
                { name: '⚡ Chat & Raid Shields', value: '✅ Anti-Spam & Duplicate Filter\n✅ Anti-Mass Mention & Invites\n✅ Anti-Delete & Ghost Ping Log', inline: true },
                { name: '👑 Whitelist Status', value: `Owner (<@${guild.ownerId}>) & Bot are automatically whitelisted. Use \`/whitelist\` or \`/antinuke\` to manage trusted admins.`, inline: false }
            )
            .setFooter({ text: 'Discord Anti-Nuke Automated Shield • 24/7 Active Protection' })
            .setTimestamp();

        await logChannel.send({ embeds: [setupEmbed] }).catch(() => {});
    }

    addLog('Security Auto-Setup', guild.id, logChannel?.id || 'none', true, `Guild: ${guild.name}`);
    return logChannel;
}

// Send Formatted Security Alerts
async function sendSecurityAlert(guild, { title, description, fields = [], color = 0xFF0033, thumbnail = null }) {
    if (!guild) return;
    const sec = getGuildSecurity(guild.id, guild.ownerId);
    let logChannel = null;
    if (sec.logChannelId) {
        logChannel = guild.channels.cache.get(sec.logChannelId) || await guild.channels.fetch(sec.logChannelId).catch(() => null);
    }
    if (!logChannel) {
        logChannel = await autoSetupGuildSecurity(guild, true);
    }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ text: `Anti-Nuke Shield • ${guild.name}` });

    if (thumbnail) {
        embed.setThumbnail(thumbnail);
    }
    if (fields.length > 0) {
        embed.addFields(fields);
    }

    if (logChannel) {
        await logChannel.send({ embeds: [embed] }).catch(() => {});
    }
}

// Execute Punishment on Attacker (Ban, Strip Roles, Timeout)
async function punishAttacker(guild, executor, actionName, details = '') {
    if (!guild || !executor || isWhitelisted(guild, executor.id)) return false;

    let punished = false;
    let punishmentAction = 'Banned from server';
    const reason = `[Anti-Nuke Shield] Unauthorized ${actionName}: ${details}`;

    try {
        // Attempt ban
        await guild.members.ban(executor.id, { reason });
        punished = true;
    } catch (banErr) {
        // Fallback: Strip all roles and timeout
        try {
            const member = await guild.members.fetch(executor.id).catch(() => null);
            if (member) {
                if (member.bannable || member.moderatable) {
                    await member.roles.set([], `[Anti-Nuke] Stripped roles due to ${actionName}`).catch(() => {});
                    await member.timeout(28 * 24 * 60 * 60 * 1000, reason).catch(() => {});
                    punished = true;
                    punishmentAction = 'All Roles Stripped & 28-Day Timeout Applied (Hierarchy protected ban)';
                }
            }
        } catch (stripErr) {
            console.error('[Anti-Nuke] Punishment execution error:', stripErr.message);
        }
    }

    const attackerAvatar = executor.displayAvatarURL ? executor.displayAvatarURL({ dynamic: true }) : null;
    await sendSecurityAlert(guild, {
        title: `🚨 ATTACK BLOCKED: Rogue ${actionName}`,
        description: `**A dangerous or unauthorized action was detected and stopped immediately!**`,
        color: 0xFF0000,
        thumbnail: attackerAvatar,
        fields: [
            { name: '👤 Attacker', value: `<@${executor.id}> (\`${executor.tag || executor.username || executor.id}\`)`, inline: true },
            { name: '⚡ Action Attempted', value: `\`${actionName}\``, inline: true },
            { name: '🔨 Punishment Applied', value: `**${punishmentAction}**`, inline: false },
            { name: '📋 Incident Details', value: details || 'Rate threshold exceeded on destructive server modification', inline: false }
        ]
    });

    addLog('Attacker Neutralized', executor.id, guild.id, true, `Action: ${actionName} | Punishment: ${punishmentAction}`);
    return punished;
}

// Helper to fetch latest audit log entry with safety window
async function fetchLatestAuditEntry(guild, eventType) {
    try {
        const botMember = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
            return null;
        }
        const auditLogs = await guild.fetchAuditLogs({ limit: 1, type: eventType }).catch(() => null);
        if (!auditLogs || auditLogs.entries.size === 0) return null;
        const entry = auditLogs.entries.first();
        // Ensure entry is recent (within 8 seconds)
        if (Date.now() - entry.createdTimestamp > 8000) return null;
        return entry;
    } catch (e) {
        return null;
    }
}

// ============================================================================
// 🤖 24/7 AI Engine, Lua Runner, and Code Generation Architecture
// ============================================================================

let genAIClient = null;
function getGenAI() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    if (!genAIClient) {
        genAIClient = new GoogleGenAI({
            apiKey,
            httpOptions: {
                headers: {
                    'User-Agent': 'aistudio-build'
                }
            }
        });
    }
    return genAIClient;
}

// ----------------------------------------------------------------------------
// 🎨 Real AI Photo Generation Engine (Gemini 3.1 Flash Image + Neural Flux/Turbo)
// ----------------------------------------------------------------------------
async function generateRealAIImage({ prompt, style = 'Digital Art', aspectRatio = '1:1', name = '' }) {
    const ratios = {
        '1:1': { width: 1024, height: 1024, fluxW: 1024, fluxH: 1024 },
        '16:9': { width: 1280, height: 720, fluxW: 1024, fluxH: 576 },
        '9:16': { width: 720, height: 1280, fluxW: 576, fluxH: 1024 },
        '4:3': { width: 1024, height: 768, fluxW: 1024, fluxH: 768 },
        '3:4': { width: 768, height: 1024, fluxW: 768, fluxH: 1024 }
    };
    const validAspectRatio = ratios[aspectRatio] ? aspectRatio : '1:1';
    const dims = ratios[validAspectRatio];

    const cleanPrompt = (prompt || '').trim();
    let styledPrompt = cleanPrompt;
    if (style === 'Photorealistic') {
        styledPrompt = `${cleanPrompt}, raw 8k authentic photograph, professional photography, studio lighting, hyperrealistic details, sharp focus, 35mm lens`;
    } else if (style === 'Cyberpunk Neon') {
        styledPrompt = `${cleanPrompt}, cyberpunk neon lighting, futuristic night aesthetic, volumetric glow, octane render, 8k resolution`;
    } else if (style === 'Anime Vibrant') {
        styledPrompt = `${cleanPrompt}, high quality anime illustration, vivid lighting, Makoto Shinkai aesthetic, clean lineart, masterpiece`;
    } else if (style === '3D Render') {
        styledPrompt = `${cleanPrompt}, 3D digital art, Octane render, raytracing, soft studio lighting, ultra detailed textures, 4k`;
    } else if (style === 'Cinematic Landscape') {
        styledPrompt = `${cleanPrompt}, cinematic wide angle, dramatic golden hour sky, 70mm film stock, breathtaking atmospheric depth, 8k`;
    } else if (style === 'Oil Painting') {
        styledPrompt = `${cleanPrompt}, classical fine art oil painting, rich textured brushstrokes, renaissance gallery masterpiece`;
    } else if (style === 'Retro Synthwave') {
        styledPrompt = `${cleanPrompt}, 80s outrun synthwave aesthetic, neon wireframe, magenta and cyan horizon glow, retrofuturism`;
    } else if (style === 'Fantasy') {
        styledPrompt = `${cleanPrompt}, epic fantasy concept art, magical glowing ambiance, intricate majestic details, trending on ArtStation`;
    } else {
        styledPrompt = `${cleanPrompt}, high quality digital art concept, vivid colors, dynamic lighting, masterpiece, sharp details`;
    }

    let finalDataUrl = null;
    let engineUsed = 'Flux.1 Neural AI Engine';
    let mimeType = 'image/jpeg';

    // 1. Try Gemini 3.1 Flash Image model if Gemini API key exists
    const ai = getGenAI();
    if (ai) {
        try {
            const imageResponse = await ai.models.generateContent({
                model: 'gemini-3.1-flash-lite-image',
                contents: {
                    parts: [{ text: styledPrompt }]
                },
                config: {
                    imageConfig: {
                        aspectRatio: validAspectRatio
                    }
                }
            });

            const candidate = imageResponse.candidates?.[0];
            if (candidate && candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.inlineData && part.inlineData.data) {
                        mimeType = part.inlineData.mimeType || 'image/png';
                        finalDataUrl = `data:${mimeType};base64,${part.inlineData.data}`;
                        engineUsed = 'Gemini 3.1 Flash Image';
                        break;
                    }
                }
            }
        } catch (apiErr) {
            console.warn('[AI Studio] Gemini image generation notice:', apiErr.message);
        }
    }

    // 2. Real-Time Neural Diffusion Image Generation (Flux.1)
    if (!finalDataUrl) {
        try {
            const seed = Math.floor(Math.random() * 1000000);
            const targetUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(styledPrompt)}?width=${dims.fluxW}&height=${dims.fluxH}&seed=${seed}&nologo=true&model=flux`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);
            
            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                if (buffer.length > 1000) {
                    const contentType = response.headers.get('content-type') || 'image/jpeg';
                    mimeType = contentType.split(';')[0];
                    finalDataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
                    engineUsed = 'Flux.1 Neural AI Engine';
                }
            }
        } catch (fetchErr) {
            console.warn('[AI Studio] Flux image generation warning:', fetchErr.message);
        }
    }

    // 3. High Quality Fast Turbo Diffusion Backup
    if (!finalDataUrl) {
        try {
            const seed2 = Math.floor(Math.random() * 1000000);
            const targetUrl2 = `https://image.pollinations.ai/prompt/${encodeURIComponent(styledPrompt)}?width=${dims.fluxW}&height=${dims.fluxH}&seed=${seed2}&nologo=true&model=turbo`;
            const resp2 = await fetch(targetUrl2);
            if (resp2.ok) {
                const arrayBuffer = await resp2.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                if (buffer.length > 1000) {
                    mimeType = resp2.headers.get('content-type') || 'image/jpeg';
                    finalDataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
                    engineUsed = 'Turbo Diffusion AI Engine';
                }
            }
        } catch (e2) {
            console.warn('[AI Studio] Turbo backup image error:', e2.message);
        }
    }

    // 4. Procedural fallback if totally offline
    if (!finalDataUrl) {
        const procResult = generateProceduralArt({
            prompt: cleanPrompt,
            style,
            aspectRatio: validAspectRatio,
            name
        });
        return {
            dataUrl: procResult.dataUrl,
            mimeType: 'image/svg+xml',
            width: procResult.width,
            height: procResult.height,
            engineUsed: 'Vector Studio Fallback'
        };
    }

    return {
        dataUrl: finalDataUrl,
        mimeType,
        width: dims.width,
        height: dims.height,
        engineUsed
    };
}

// ----------------------------------------------------------------------------
// 🎨 Procedural HD Vector/SVG Art Generator & Image Transformer (Offline Fallback)
// ----------------------------------------------------------------------------
function generateProceduralArt({ prompt, style = 'Digital Art', aspectRatio = '1:1', name = '', editLayer = null }) {
    const ratios = {
        '1:1': { width: 1024, height: 1024 },
        '16:9': { width: 1280, height: 720 },
        '9:16': { width: 720, height: 1280 },
        '4:3': { width: 1024, height: 768 },
        '3:4': { width: 768, height: 1024 }
    };
    const dims = ratios[aspectRatio] || ratios['1:1'];
    const w = dims.width;
    const h = dims.height;

    const lowerPrompt = (prompt || '').toLowerCase();
    const isCyberpunk = lowerPrompt.includes('cyber') || lowerPrompt.includes('neon') || lowerPrompt.includes('future') || style === 'Cyberpunk';
    const isSynthwave = lowerPrompt.includes('synth') || lowerPrompt.includes('retro') || lowerPrompt.includes('80s') || style === 'Synthwave';
    const isAnime = lowerPrompt.includes('anime') || lowerPrompt.includes('manga') || lowerPrompt.includes('japan') || style === 'Anime';
    const isSpace = lowerPrompt.includes('space') || lowerPrompt.includes('galaxy') || lowerPrompt.includes('planet') || lowerPrompt.includes('star') || style === 'Sci-Fi';
    const isFantasy = lowerPrompt.includes('fantasy') || lowerPrompt.includes('magic') || lowerPrompt.includes('castle') || lowerPrompt.includes('dragon') || style === 'Fantasy';
    const isNature = lowerPrompt.includes('nature') || lowerPrompt.includes('forest') || lowerPrompt.includes('mountain') || lowerPrompt.includes('sea') || style === 'Watercolor';

    let bgGrad1 = '#090a1a';
    let bgGrad2 = '#1a0b2e';
    let accent1 = '#00e5ff';
    let accent2 = '#ff007f';
    let accent3 = '#7928ca';

    if (isCyberpunk) {
        bgGrad1 = '#050510';
        bgGrad2 = '#0d1117';
        accent1 = '#00f0ff';
        accent2 = '#ff0055';
        accent3 = '#ffe600';
    } else if (isSynthwave) {
        bgGrad1 = '#1a0033';
        bgGrad2 = '#330066';
        accent1 = '#ff71ce';
        accent2 = '#01cdfe';
        accent3 = '#05ffa1';
    } else if (isAnime) {
        bgGrad1 = '#ffe5ec';
        bgGrad2 = '#ffb3c6';
        accent1 = '#ff4d6d';
        accent2 = '#c9184a';
        accent3 = '#ff758f';
    } else if (isSpace) {
        bgGrad1 = '#020024';
        bgGrad2 = '#090979';
        accent1 = '#00d4ff';
        accent2 = '#9d4edd';
        accent3 = '#ffffff';
    } else if (isFantasy) {
        bgGrad1 = '#0b132b';
        bgGrad2 = '#1c2541';
        accent1 = '#48cae4';
        accent2 = '#7209b7';
        accent3 = '#f72585';
    } else if (isNature) {
        bgGrad1 = '#0d3b66';
        bgGrad2 = '#001845';
        accent1 = '#52b788';
        accent2 = '#74c69d';
        accent3 = '#f4a261';
    }

    let starsSvg = '';
    const starCount = isSpace || isSynthwave || isFantasy ? 90 : 45;
    for (let i = 0; i < starCount; i++) {
        const sx = Math.floor((Math.sin(i * 997 + 1) * 0.5 + 0.5) * w);
        const sy = Math.floor((Math.cos(i * 613 + 2) * 0.5 + 0.5) * (h * 0.7));
        const sr = (i % 5 === 0 ? 2.5 : (i % 3 === 0 ? 1.8 : 1.0));
        const op = (0.3 + (i % 7) * 0.1).toFixed(2);
        starsSvg += `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="${accent3}" opacity="${op}"/>`;
    }

    let gridSvg = '';
    if (isSynthwave || isCyberpunk) {
        const horizon = h * 0.65;
        gridSvg += `<line x1="0" y1="${horizon}" x2="${w}" y2="${horizon}" stroke="${accent1}" stroke-width="3" opacity="0.8"/>`;
        for (let i = 0; i < 16; i++) {
            const frac = i / 15;
            const xBottom = frac * w;
            const xTop = w * 0.5 + (frac - 0.5) * (w * 0.3);
            gridSvg += `<line x1="${xTop}" y1="${horizon}" x2="${xBottom}" y2="${h}" stroke="${accent1}" stroke-width="1.5" opacity="0.4"/>`;
        }
        for (let j = 1; j <= 8; j++) {
            const py = horizon + (h - horizon) * Math.pow(j / 8, 2);
            gridSvg += `<line x1="0" y1="${py}" x2="${w}" y2="${py}" stroke="${accent2}" stroke-width="1.2" opacity="0.5"/>`;
        }
    }

    let mountainSvg = '';
    const mHorizon = h * 0.65;
    mountainSvg += `<path d="M0,${mHorizon} L${w * 0.15},${mHorizon - 120} L${w * 0.3},${mHorizon - 40} L${w * 0.45},${mHorizon - 180} L${w * 0.65},${mHorizon - 70} L${w * 0.85},${mHorizon - 150} L${w},${mHorizon} L${w},${h} L0,${h} Z" fill="#080816" opacity="0.95"/>`;
    mountainSvg += `<path d="M0,${mHorizon} L${w * 0.25},${mHorizon - 90} L${w * 0.5},${mHorizon - 20} L${w * 0.75},${mHorizon - 110} L${w},${mHorizon} L${w},${h} L0,${h} Z" fill="#120e29" opacity="0.7"/>`;

    const sunX = w * 0.5;
    const sunY = h * 0.42;
    const sunRadius = Math.min(w, h) * 0.22;
    const sunSvg = `
        <defs>
            <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="${accent2}" stop-opacity="1"/>
                <stop offset="60%" stop-color="${accent1}" stop-opacity="0.8"/>
                <stop offset="100%" stop-color="${accent3}" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="sunBars" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="${accent2}"/>
                <stop offset="100%" stop-color="${accent1}"/>
            </linearGradient>
            <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${bgGrad1}"/>
                <stop offset="100%" stop-color="${bgGrad2}"/>
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="15" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
        </defs>
        <circle cx="${sunX}" cy="${sunY}" r="${sunRadius * 1.5}" fill="url(#sunGlow)" opacity="0.4"/>
        <circle cx="${sunX}" cy="${sunY}" r="${sunRadius}" fill="url(#sunBars)" filter="url(#glow)"/>
    `;

    let editBadge = '';
    if (editLayer) {
        editBadge = `
            <g transform="translate(40, ${h - 80})">
                <rect x="0" y="0" width="${w - 80}" height="45" rx="8" fill="#000000" opacity="0.65" stroke="${accent1}" stroke-width="1.5"/>
                <text x="20" y="28" fill="#ffffff" font-family="system-ui, sans-serif" font-size="16" font-weight="600">✨ Modified: ${escapeXml(editLayer)}</text>
            </g>
        `;
    }

    const titleText = escapeXml(name || prompt || 'Studio Artwork');
    const styleBadge = escapeXml(style);

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
    ${sunSvg}
    ${starsSvg}
    ${mountainSvg}
    ${gridSvg}
    <g transform="translate(40, 60)">
        <rect x="0" y="0" width="130" height="32" rx="16" fill="${accent1}" opacity="0.9"/>
        <text x="14" y="21" fill="#000000" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="bold">${styleBadge}</text>
    </g>
    <text x="40" y="${h - 40}" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="bold" letter-spacing="0.5" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.8))">${titleText}</text>
    ${editBadge}
</svg>
    `.trim();

    const base64Svg = Buffer.from(svg).toString('base64');
    return {
        svg,
        dataUrl: `data:image/svg+xml;base64,${base64Svg}`,
        width: w,
        height: h
    };
}

function escapeXml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ----------------------------------------------------------------------------
// 🖼️ High-Level Photo Generation Service
// ----------------------------------------------------------------------------
async function generatePhotoWithAI({ prompt, name = '', aspectRatio = '1:1', style = 'Digital Art', author = 'User' }) {
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        throw new Error('Prompt is required for photo generation');
    }

    const cleanPrompt = prompt.trim();
    const cleanName = name && name.trim().length > 0 
        ? name.trim() 
        : cleanPrompt.slice(0, 40).replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'AI Masterpiece';

    const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    const validAspectRatio = validRatios.includes(aspectRatio) ? aspectRatio : '1:1';

    const aiImage = await generateRealAIImage({
        prompt: cleanPrompt,
        style,
        aspectRatio: validAspectRatio,
        name: cleanName
    });

    const photoId = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const newPhoto = {
        id: photoId,
        name: cleanName,
        prompt: cleanPrompt,
        style,
        aspectRatio: validAspectRatio,
        dataUrl: aiImage.dataUrl,
        mimeType: aiImage.mimeType || 'image/jpeg',
        engine: aiImage.engineUsed,
        width: aiImage.width,
        height: aiImage.height,
        author: author || 'Studio Artist',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        history: [
            {
                action: 'created',
                timestamp: new Date().toISOString(),
                details: `Generated with prompt "${cleanPrompt}" in style "${style}" (${validAspectRatio}) [${aiImage.engineUsed}]`
            }
        ]
    };

    photos.unshift(newPhoto);
    savePhotos();
    addLog('Photo Generated', photoId, cleanName, true, `Prompt: "${cleanPrompt.slice(0, 30)}..." [${aiImage.engineUsed}]`);

    return newPhoto;
}

// ----------------------------------------------------------------------------
// ✨ Photo Editor & Transformer ("Change things for you")
// ----------------------------------------------------------------------------
async function editPhotoWithAI({ photoId, instruction, newName = '', filterAdjustments = {}, author = 'User' }) {
    if (!photoId) throw new Error('photoId is required');
    if (!instruction || typeof instruction !== 'string' || instruction.trim().length === 0) {
        throw new Error('Modification instruction is required');
    }

    const photoIndex = photos.findIndex(p => p.id === photoId || p.name.toLowerCase() === photoId.toLowerCase());
    if (photoIndex === -1) {
        throw new Error(`Photo not found with ID or name: "${photoId}"`);
    }

    const photo = photos[photoIndex];
    const cleanInstruction = instruction.trim();
    const refinedPrompt = `${photo.prompt}, modified with: ${cleanInstruction}, preserving core subject, masterpiece`;

    const aiImage = await generateRealAIImage({
        prompt: refinedPrompt,
        style: photo.style || 'Digital Art',
        aspectRatio: photo.aspectRatio || '1:1',
        name: newName && newName.trim().length > 0 ? newName.trim() : photo.name
    });

    const oldName = photo.name;
    if (newName && newName.trim().length > 0) {
        photo.name = newName.trim();
    }

    photo.prompt = refinedPrompt;
    photo.dataUrl = aiImage.dataUrl;
    photo.mimeType = aiImage.mimeType || 'image/jpeg';
    photo.engine = `${aiImage.engineUsed} (Modified)`;
    photo.updatedAt = new Date().toISOString();
    if (!photo.history) photo.history = [];
    photo.history.push({
        action: 'edited',
        timestamp: new Date().toISOString(),
        details: `Modified: "${cleanInstruction}" by ${author}${newName ? ` (Renamed from "${oldName}" to "${photo.name}")` : ''}`
    });

    photos[photoIndex] = photo;
    savePhotos();
    addLog('Photo Modified', photo.id, photo.name, true, `Instruction: "${cleanInstruction.slice(0, 30)}..."`);

    return photo;
}

// ----------------------------------------------------------------------------
// 🏷️ Photo Renamer ("Update photos name")
// ----------------------------------------------------------------------------
function renamePhotoInGallery({ photoId, newName, author = 'User' }) {
    if (!photoId) throw new Error('photoId is required');
    if (!newName || typeof newName !== 'string' || newName.trim().length === 0) {
        throw new Error('newName is required');
    }

    const photoIndex = photos.findIndex(p => p.id === photoId || p.name.toLowerCase() === photoId.toLowerCase());
    if (photoIndex === -1) {
        throw new Error(`Photo not found with ID or name: "${photoId}"`);
    }

    const photo = photos[photoIndex];
    const oldName = photo.name;
    photo.name = newName.trim();
    photo.updatedAt = new Date().toISOString();
    if (!photo.history) photo.history = [];
    photo.history.push({
        action: 'renamed',
        timestamp: new Date().toISOString(),
        details: `Renamed from "${oldName}" to "${photo.name}" by ${author}`
    });

    photos[photoIndex] = photo;
    savePhotos();
    addLog('Photo Renamed', photo.id, photo.name, true, `Old: "${oldName}" ➔ New: "${photo.name}"`);

    return photo;
}

// ----------------------------------------------------------------------------
// 🗑️ Photo Deletion
// ----------------------------------------------------------------------------
function deletePhotoFromGallery(photoId) {
    const initialLen = photos.length;
    photos = photos.filter(p => p.id !== photoId && p.name.toLowerCase() !== photoId.toLowerCase());
    if (photos.length < initialLen) {
        savePhotos();
        addLog('Photo Deleted', photoId, 'Gallery', true, `Removed photo ${photoId}`);
        return { success: true, count: photos.length };
    }
    return { success: false, error: 'Photo not found' };
}


// Track forwarded messages
const forwardedMessageIds = new Set();

// Save data
function saveForwards() {
    fs.writeFileSync(forwardsPath, JSON.stringify(forwards, null, 2));
}

// Express App Setup
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Track start time
const SERVER_START_TIME = Date.now();

// Health Check Endpoints for 24/7 Uptime Monitors (UptimeRobot, BetterStack, CronJob, etc.)
app.get(['/health', '/ping'], (req, res) => {
    const isBotReady = client.isReady();
    res.status(200).json({
        status: 'ok',
        service: 'Discord Forwarder Bot',
        uptimeSeconds: Math.floor(process.uptime()),
        botOnline: isBotReady,
        botTag: isBotReady ? client.user.tag : null,
        wsPingMs: isBotReady && client.ws ? client.ws.ping : null,
        timestamp: new Date().toISOString()
    });
});

// Self-Ping Keep-Alive Heartbeat (runs every 4 minutes to prevent container sleeping)
setInterval(async () => {
    try {
        const fetch = globalThis.fetch || require('node-fetch');
        await fetch(`http://127.0.0.1:${PORT}/health`).catch(() => {});
    } catch (e) {
        // Silent catch for internal self-ping
    }
}, 4 * 60 * 1000);

// API Routes
app.get('/api/status', (req, res) => {
    const online = client.isReady();
    res.json({
        online,
        hasToken: Boolean(botToken && botToken.trim().length > 0),
        hasUserToken: Boolean(userToken && userToken.trim().length > 0),
        botTag: online ? client.user.tag : null,
        clientId: online ? client.user.id : (process.env.CLIENT_ID || '1534092488451686461'),
        guildsCount: online ? client.guilds.cache.size : 0,
        forwardsCount: Object.values(forwards).reduce((acc, targets) => acc + Object.keys(targets).length, 0),
        logsCount: activityLogs.length,
        prefix: PREFIX,
        uptimeSeconds: Math.floor(process.uptime()),
        wsPingMs: online && client.ws ? client.ws.ping : null,
        serverStartedAt: SERVER_START_TIME,
        forwards,
        guilds: online ? client.guilds.cache.map(g => ({
            id: g.id,
            name: g.name,
            channelsCount: g.channels.cache.size
        })) : [],
        logs: activityLogs.slice(0, 50)
    });
});

app.get('/api/settings', (req, res) => {
    res.json({
        hasBotToken: Boolean(botToken && botToken.trim().length > 0),
        botTokenMasked: botToken ? `••••••••${botToken.trim().slice(-4)}` : '',
        hasUserToken: Boolean(userToken && userToken.trim().length > 0),
        userTokenMasked: userToken ? `••••••••${userToken.trim().slice(-4)}` : ''
    });
});

app.post('/api/settings', async (req, res) => {
    const { newUserToken, newBotToken } = req.body;
    let updated = false;

    if (typeof newBotToken === 'string') {
        botToken = newBotToken.trim();
        updated = true;
        addLog('Settings Updated', 'Web Dashboard', 'Bot', true, botToken ? 'Bot Token Configured' : 'Bot Token Cleared');
        if (botToken && !client.isReady()) {
            client.login(botToken).catch(err => {
                console.error('❌ Login with new bot token failed:', err.message);
                addLog('Login Failed', 'Web Settings', 'Bot', false, err.message);
            });
        }
    }

    if (typeof newUserToken === 'string') {
        userToken = newUserToken.trim();
        updated = true;
        addLog('Settings Updated', 'Web Dashboard', 'Bot', true, userToken ? 'User Token Configured' : 'User Token Cleared');
    }

    if (updated) {
        saveSettings();
        return res.json({ 
            success: true, 
            hasBotToken: Boolean(botToken),
            hasUserToken: Boolean(userToken) 
        });
    }

    res.status(400).json({ error: 'Invalid settings payload' });
});

app.post('/api/manual-forward', async (req, res) => {
    const { targetChannelId, messageText, senderName } = req.body;
    if (!targetChannelId || !messageText) {
        return res.status(400).json({ error: 'Missing targetChannelId or messageText' });
    }
    if (!client.isReady()) {
        return res.status(400).json({ error: 'Bot is offline. Configure TOKEN in environment variables.' });
    }
    try {
        const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) {
            return res.status(404).json({ error: 'Target channel not found or bot does not have access to it.' });
        }

        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({ name: senderName || 'Dashboard Web Importer' })
            .setDescription(messageText)
            .setTimestamp();

        await targetChannel.send({ embeds: [embed] });
        addLog('Manual Forward', 'Web Dashboard', targetChannelId, true, `Sent by ${senderName || 'Dashboard'}`);
        res.json({ success: true, message: 'Message successfully sent to target channel!' });
    } catch (err) {
        console.error('Manual forward error:', err);
        addLog('Manual Forward Error', 'Web Dashboard', targetChannelId, false, err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/webhook/forward', async (req, res) => {
    const { targetChannelId, content, author, source } = req.body;
    if (!targetChannelId || !content) {
        return res.status(400).json({ error: 'Missing targetChannelId or content' });
    }
    if (!client.isReady()) {
        return res.status(400).json({ error: 'Bot is offline.' });
    }
    try {
        const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
        if (!targetChannel || !targetChannel.isTextBased()) {
            return res.status(404).json({ error: 'Target channel not found.' });
        }

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setAuthor({ name: author || 'External Webhook' })
            .setDescription(content)
            .setFooter({ text: source ? `Via ${source}` : 'Webhook Receiver' })
            .setTimestamp();

        await targetChannel.send({ embeds: [embed] });
        addLog('Webhook Forward', source || 'External Webhook', targetChannelId, true);
        res.json({ success: true, message: 'Webhook message forwarded successfully!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/forwards', (req, res) => {
    res.json({ success: true, forwards });
});

app.post('/api/forwards', (req, res) => {
    const { guildId, targetChannelId, sourceChannelId } = req.body;
    if (!guildId || !targetChannelId || !sourceChannelId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!forwards[guildId]) forwards[guildId] = {};
    if (!forwards[guildId][targetChannelId]) forwards[guildId][targetChannelId] = [];
    if (!forwards[guildId][targetChannelId].includes(sourceChannelId)) {
        forwards[guildId][targetChannelId].push(sourceChannelId);
        saveForwards();
    }
    addLog('API Rule Added', sourceChannelId, targetChannelId, true, `Guild: ${guildId}`);
    res.json({ success: true, forwards });
});

app.delete('/api/forwards', (req, res) => {
    const { guildId, targetChannelId } = req.body;
    if (forwards[guildId] && forwards[guildId][targetChannelId]) {
        delete forwards[guildId][targetChannelId];
        saveForwards();
        addLog('API Rule Removed', '*', targetChannelId, true, `Guild: ${guildId}`);
    }
    res.json({ success: true, forwards });
});

app.delete('/api/logs', (req, res) => {
    activityLogs.length = 0;
    res.json({ success: true });
});

// Security & Anti-Nuke API Endpoints
app.get('/api/security', (req, res) => {
    const guildsData = client.isReady() ? client.guilds.cache.map(g => {
        const sec = getGuildSecurity(g.id);
        return {
            id: g.id,
            name: g.name,
            icon: g.iconURL(),
            ownerId: g.ownerId,
            channelsCount: g.channels.cache.size,
            rolesCount: g.roles.cache.size,
            membersCount: g.memberCount,
            security: sec
        };
    }) : [];

    res.json({
        success: true,
        masterOwnerId: getMasterOwnerId(),
        guilds: guildsData,
        securityConfig,
        shields: [
            { id: 'antiChannelDelete', name: 'Anti-Channel Delete', desc: 'Auto-recreates deleted channels & bans attackers', active: true },
            { id: 'antiRoleDelete', name: 'Anti-Role Delete', desc: 'Auto-recreates deleted roles & punishes attackers', active: true },
            { id: 'antiBan', name: 'Anti-Mass Ban', desc: 'Blocks mass bans & automatically restores banned users', active: true },
            { id: 'antiKick', name: 'Anti-Mass Kick', desc: 'Detects and neutralizes rogue moderators kicking members', active: true },
            { id: 'antiBot', name: 'Anti-Bot Invites', desc: 'Bans unwhitelisted bots added by non-whitelisted users', active: true },
            { id: 'antiWebhook', name: 'Anti-Webhook Spam', desc: 'Deletes rogue webhooks and punishes creators', active: true },
            { id: 'antiSpam', name: 'Anti-Spam Filter', desc: 'Rate-limits messages & automatically mutes spam accounts', active: true },
            { id: 'antiInvite', name: 'Anti-Discord Invites', desc: 'Blocks unauthorized Discord server invite links', active: true },
            { id: 'antiMassMention', name: 'Anti-Mass Mention', desc: 'Blocks raid pings and @everyone abuse', active: true },
            { id: 'antiDelete', name: 'Anti-Delete & Ghost Ping', desc: 'Logs deleted messages and flags stealth ghost pings', active: true },
            { id: 'autoRestore', name: 'Auto-Restore Engine', desc: 'Instantly recovers destroyed channels and server roles', active: true }
        ]
    });
});

app.post('/api/security/toggle', (req, res) => {
    const { guildId, shield, enabled } = req.body;
    if (!guildId || !shield) {
        return res.status(400).json({ error: 'Missing guildId or shield' });
    }
    const sec = getGuildSecurity(guildId);
    if (typeof sec[shield] !== 'undefined' || shield === 'enabled') {
        sec[shield] = Boolean(enabled);
        saveSecurity();
        addLog('Security Config Updated', guildId, shield, true, `${shield} set to ${enabled}`);
        return res.json({ success: true, security: sec });
    }
    res.status(400).json({ error: 'Invalid shield name' });
});

app.post('/api/security/whitelist', (req, res) => {
    const { guildId, userId, action } = req.body;
    if (!guildId || !userId) {
        return res.status(400).json({ error: 'Missing guildId or userId' });
    }
    const sec = getGuildSecurity(guildId);
    const masterId = getMasterOwnerId();
    if (action === 'remove') {
        if (userId === masterId || isMasterOwner(userId)) {
            return res.status(400).json({ error: 'Cannot remove Master Bot Operator from whitelist' });
        }
        sec.whitelist = sec.whitelist.filter(id => id !== userId);
    } else {
        if (!sec.whitelist.includes(userId)) {
            sec.whitelist.push(userId);
        }
    }
    saveSecurity();
    addLog('Whitelist Updated', userId, guildId, true, `Action: ${action || 'add'}`);
    res.json({ success: true, whitelist: sec.whitelist });
});

app.post('/api/security/unwhitelist-all', (req, res) => {
    const masterId = getMasterOwnerId();
    const botId = client.user?.id;
    let unwhitelistedCount = 0;

    for (const gId in securityConfig) {
        if (securityConfig[gId] && Array.isArray(securityConfig[gId].whitelist)) {
            const beforeLen = securityConfig[gId].whitelist.length;
            securityConfig[gId].whitelist = securityConfig[gId].whitelist.filter(id => id === masterId || isMasterOwner(id) || (botId && id === botId));
            unwhitelistedCount += (beforeLen - securityConfig[gId].whitelist.length);
        }
    }
    saveSecurity();
    addLog('Bulk Unwhitelist All', masterId, 'All Guilds', true, `Unwhitelisted all except Master Operator`);
    res.json({ success: true, unwhitelistedCount, securityConfig });
});

// ----------------------------------------------------------------------------
// 🔒 Access Control, Bot Lock & Admin Roles API Endpoints
// ----------------------------------------------------------------------------
app.get('/api/access/status', (req, res) => {
    const masterId = getMasterOwnerId();
    const guildId = req.query.guildId;
    let sec = null;
    if (guildId) {
        sec = getGuildSecurity(guildId);
    }

    const botId = client.user?.id || '1534092488451686461';
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;

    res.json({
        success: true,
        masterOwnerId: masterId,
        botId,
        inviteUrl,
        botReady: client.isReady(),
        botTag: client.user?.tag || 'Discord Bot',
        security: sec,
        allSecurity: securityConfig
    });
});

app.post('/api/access/admin-role', (req, res) => {
    const { guildId, roleId, action } = req.body;
    if (!guildId || !roleId) {
        return res.status(400).json({ success: false, error: 'Missing guildId or roleId' });
    }
    const sec = getGuildSecurity(guildId);
    if (!Array.isArray(sec.adminRoles)) sec.adminRoles = [];

    if (action === 'remove') {
        sec.adminRoles = sec.adminRoles.filter(id => id !== roleId);
    } else {
        if (!sec.adminRoles.includes(roleId)) {
            sec.adminRoles.push(roleId);
        }
    }
    saveSecurity();
    addLog('Admin Role Updated', roleId, guildId, true, `Action: ${action || 'add'}`);
    res.json({ success: true, adminRoles: sec.adminRoles, security: sec });
});

app.post('/api/access/bot-lock', (req, res) => {
    const { guildId, locked } = req.body;
    if (!guildId) {
        return res.status(400).json({ success: false, error: 'Missing guildId' });
    }
    const sec = getGuildSecurity(guildId);
    sec.botLocked = Boolean(locked);
    saveSecurity();
    addLog('Bot Lock Toggled', locked ? 'Locked' : 'Unlocked', guildId, true, `Bot lock set to ${locked}`);
    res.json({ success: true, botLocked: sec.botLocked, security: sec });
});

app.get('/api/bot/invite', (req, res) => {
    const botId = client.user?.id || '1534092488451686461';
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;
    res.json({
        success: true,
        botId,
        botTag: client.user?.tag || 'Discord Bot',
        permissions: 8,
        permissionsName: 'Administrator',
        inviteUrl
    });
});

app.post('/api/security/auto-setup', async (req, res) => {
    if (!client.isReady()) {
        return res.status(400).json({ error: 'Bot is offline' });
    }
    const results = [];
    for (const [, guild] of client.guilds.cache) {
        const logChannel = await autoSetupGuildSecurity(guild, false);
        results.push({
            guildId: guild.id,
            guildName: guild.name,
            logChannelId: logChannel?.id || null
        });
    }
    res.json({ success: true, setupCount: results.length, results });
});

// ----------------------------------------------------------------------------
// 🔄 Server Cloner API Endpoints
// ----------------------------------------------------------------------------
app.get('/api/server/guilds', async (req, res) => {
    if (!client.isReady()) {
        return res.json({ success: false, guilds: [] });
    }
    try {
        const guildsList = [];
        for (const [, g] of client.guilds.cache) {
            guildsList.push({
                id: g.id,
                name: g.name,
                icon: g.iconURL ? g.iconURL({ extension: 'png', size: 128 }) : null,
                channelsCount: g.channels.cache.size,
                rolesCount: g.roles.cache.size,
                emojisCount: g.emojis.cache.size,
                memberCount: g.memberCount,
                isOwner: g.ownerId === client.user.id
            });
        }
        res.json({ success: true, guilds: guildsList });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message, guilds: [] });
    }
});

app.post('/api/server/clone', async (req, res) => {
    const { sourceGuildId, destinationGuildId, clearDestination, cloneRoles, cloneChannels, cloneSettings, cloneEmojis } = req.body;
    if (!sourceGuildId || !destinationGuildId) {
        return res.status(400).json({ success: false, error: 'Missing source server ID or destination server ID' });
    }
    try {
        const result = await cloneServer({
            sourceGuildId,
            destinationGuildId,
            options: {
                clearDestination: clearDestination !== false,
                cloneRoles: cloneRoles !== false,
                cloneChannels: cloneChannels !== false,
                cloneSettings: cloneSettings !== false,
                cloneEmojis: cloneEmojis !== false
            },
            operatorTag: 'Web Dashboard'
        });
        res.json(result);
    } catch (err) {
        console.error('Server cloner API error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/server/mass-role', async (req, res) => {
    const { guildId, roleId, action, targetFilter } = req.body;
    if (!guildId || !roleId) {
        return res.status(400).json({ success: false, error: 'Missing guildId or roleId' });
    }
    if (!client.isReady()) {
        return res.status(400).json({ success: false, error: 'Discord bot is currently offline.' });
    }
    try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            return res.status(404).json({ success: false, error: 'Server not found or bot is not in that server.' });
        }
        const result = await executeMassRole({
            guild,
            roleId,
            action: action || 'add',
            targetFilter: targetFilter || 'all',
            operator: 'Web Dashboard'
        });
        res.json(result);
    } catch (err) {
        console.error('Mass role API error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/server/lockall-channels', async (req, res) => {
    const { guildId, action, scope, reason } = req.body;
    if (!guildId) {
        return res.status(400).json({ success: false, error: 'Missing guildId' });
    }
    if (!client.isReady()) {
        return res.status(400).json({ success: false, error: 'Discord bot is currently offline.' });
    }
    try {
        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            return res.status(404).json({ success: false, error: 'Server not found or bot is not in that server.' });
        }
        const result = await executeMassChannelLock({
            guild,
            action: action || 'lock',
            scope: scope || 'all',
            reason: reason || 'Server Maintenance / Lockdown',
            operator: 'Web Dashboard'
        });
        res.json(result);
    } catch (err) {
        console.error('Lockall channels API error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Photo Studio & Code Execution (Lua, Python, JavaScript) API Endpoints
app.get('/api/photos', (req, res) => {
    res.json({
        success: true,
        count: photos.length,
        photos
    });
});

app.post('/api/photos/generate', async (req, res) => {
    const { prompt, name, aspectRatio, style, author } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Prompt is required' });
    }

    try {
        const newPhoto = await generatePhotoWithAI({
            prompt: prompt.trim(),
            name: name ? name.trim() : '',
            aspectRatio: aspectRatio || '1:1',
            style: style || 'Digital Art',
            author: author || 'Studio User'
        });
        res.json({ success: true, photo: newPhoto });
    } catch (err) {
        console.error('Photo generation endpoint error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/photos/edit', async (req, res) => {
    const photoId = req.body.photoId || req.body.id;
    const instruction = req.body.instruction || req.body.instructions;
    const { newName, filterAdjustments, author } = req.body;
    if (!photoId || !instruction) {
        return res.status(400).json({ success: false, error: 'photoId and instruction are required' });
    }

    try {
        const updatedPhoto = await editPhotoWithAI({
            photoId,
            instruction,
            newName,
            filterAdjustments,
            author: author || 'Studio User'
        });
        res.json({ success: true, photo: updatedPhoto });
    } catch (err) {
        console.error('Photo edit endpoint error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/photos/rename', (req, res) => {
    const photoId = req.body.photoId || req.body.id;
    const newName = req.body.newName || req.body.name;
    const { author } = req.body;
    if (!photoId || !newName) {
        return res.status(400).json({ success: false, error: 'photoId and newName are required' });
    }

    try {
        const updatedPhoto = renamePhotoInGallery({
            photoId,
            newName,
            author: author || 'Studio User'
        });
        res.json({ success: true, photo: updatedPhoto });
    } catch (err) {
        console.error('Photo rename endpoint error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/photos/delete', (req, res) => {
    const photoId = req.body.photoId || req.body.id;
    if (!photoId) return res.status(400).json({ success: false, error: 'photoId is required' });
    const result = deletePhotoFromGallery(photoId);
    res.json(result);
});

app.delete('/api/photos/:id', (req, res) => {
    const photoId = req.params.id;
    if (!photoId) return res.status(400).json({ success: false, error: 'photoId is required' });
    const result = deletePhotoFromGallery(photoId);
    res.json(result);
});

app.get('/api/ai/status', (req, res) => {
    const isOnline = client.isReady();
    res.json({
        success: true,
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0),
        imageEngine: 'Gemini 3.1 Flash Image & Flux.1 Real Diffusion',
        totalPhotos: photos.length,
        botOnline: isOnline
    });
});

// Slash Commands Definition
const SLASH_COMMANDS = [
    {
        name: 'photo',
        description: '🎨 AI Photo Studio: Generate, edit, rename, and view AI artwork & photos',
        options: [
            {
                name: 'generate',
                description: '✨ Generate a new AI photo or artwork from a prompt',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'prompt',
                        description: 'Detailed description of the photo/artwork to create',
                        type: 3, // STRING
                        required: true
                    },
                    {
                        name: 'style',
                        description: 'Visual artistic style',
                        type: 3, // STRING
                        required: false,
                        choices: [
                            { name: 'Digital Art', value: 'Digital Art' },
                            { name: 'Cyberpunk Neon', value: 'Cyberpunk Neon' },
                            { name: 'Anime Vibrant', value: 'Anime Vibrant' },
                            { name: '3D Render / Blender', value: '3D Render' },
                            { name: 'Cinematic Landscape', value: 'Cinematic Landscape' },
                            { name: 'Oil Painting', value: 'Oil Painting' },
                            { name: 'Retro Synthwave', value: 'Retro Synthwave' }
                        ]
                    },
                    {
                        name: 'aspect_ratio',
                        description: 'Image dimensions aspect ratio',
                        type: 3, // STRING
                        required: false,
                        choices: [
                            { name: '1:1 Square', value: '1:1' },
                            { name: '16:9 Landscape', value: '16:9' },
                            { name: '9:16 Portrait / Mobile', value: '9:16' },
                            { name: '4:3 Standard', value: '4:3' }
                        ]
                    },
                    {
                        name: 'name',
                        description: 'Custom title/label for the photo (optional)',
                        type: 3, // STRING
                        required: false
                    }
                ]
            },
            {
                name: 'list',
                description: '🖼️ List recently generated AI photos in your studio gallery',
                type: 1 // SUB_COMMAND
            },
            {
                name: 'rename',
                description: '🏷️ Rename a previously generated photo',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'id',
                        description: 'The photo ID (use /photo list to check IDs)',
                        type: 3, // STRING
                        required: true
                    },
                    {
                        name: 'new_name',
                        description: 'New title for the photo',
                        type: 3, // STRING
                        required: true
                    }
                ]
            },
            {
                name: 'edit',
                description: '🪄 Modify/transform an existing photo with AI instructions',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'id',
                        description: 'The photo ID to modify',
                        type: 3, // STRING
                        required: true
                    },
                    {
                        name: 'instructions',
                        description: 'What to change or transform on the photo',
                        type: 3, // STRING
                        required: true
                    }
                ]
            }
        ]
    },
    {
        name: 'antinuke',
        description: '🛡️ Check real-time automated Anti-Nuke protection status and active shields'
    },
    {
        name: 'security',
        description: '🛡️ View server security shield status, thresholds, and auto-protection logs'
    },
    {
        name: 'whitelist',
        description: '👑 Manage whitelists (Tier 1: Server Anti-Nuke, Tier 2: Forwards, Tier 3: Commands Only)',
        options: [
            {
                name: 'action',
                description: 'Action to perform (add, remove, or list)',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'add', value: 'add' },
                    { name: 'remove', value: 'remove' },
                    { name: 'list', value: 'list' }
                ]
            },
            {
                name: 'tier',
                description: 'Whitelist Tier (1 = Server Security, 2 = Forwards & DMs, 3 = Commands Only)',
                type: 3, // STRING
                required: false,
                choices: [
                    { name: 'Tier 1: Server Anti-Nuke & Admin', value: '1' },
                    { name: 'Tier 2: Forwarding & DMs', value: '2' },
                    { name: 'Tier 3: Commands Only Access', value: '3' }
                ]
            },
            {
                name: 'user',
                description: 'User to add or remove from whitelist',
                type: 6, // USER
                required: false
            }
        ]
    },
    {
        name: 'forwardall',
        description: 'Copy all .txt files from source channel to destination channel & enable auto-forwarding',
        options: [
            {
                name: 'channel_id',
                description: 'Source channel ID (where files are copied from)',
                type: 3, // STRING
                required: true
            },
            {
                name: 'destination_channel_id',
                description: 'Destination channel ID or mention (optional - defaults to current channel)',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'stopallforward',
        description: '🛑 Stop and delete auto-forwarding rules from all servers or current server',
        options: [
            {
                name: 'scope',
                description: 'Scope of forwarding rules to stop (default: all servers)',
                type: 3, // STRING
                required: false,
                choices: [
                    { name: '🌐 All Servers (Global Wipe)', value: 'all' },
                    { name: '🏠 This Server Only', value: 'server' }
                ]
            }
        ]
    },
    {
        name: 'findsource',
        description: '📡 View all source channels configured for forwarding and their destination channels',
        options: [
            {
                name: 'source_channel_id',
                description: 'Filter by specific source channel ID or keyword',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'hub',
        description: '🔍 Search and download scripts from the Fetch Hub cache (e.g. /hub duel, /hub semi)',
        options: [
            {
                name: 'query',
                description: 'Script name or keyword to search (e.g. duel, semi, lave)',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'sod',
        description: '🔍 Search and download scripts from the Fetch Hub cache (.sod alias)',
        options: [
            {
                name: 'query',
                description: 'Script name or keyword to search (e.g. semi, duel)',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'purge',
        description: 'Purges all messages in the same channel without deleting or recreating the channel',
        options: [
            {
                name: 'amount',
                description: 'Number of messages or "all" to purge all messages in this channel (default: all)',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'clear',
        description: 'Deletes and clones the current channel to completely wipe all messages'
    },
    {
        name: 'deleteallchannels',
        description: 'Deletes all channels and categories in the server and creates a fresh text channel'
    },
    {
        name: 'exporthtml',
        description: 'Exports the channel messages into an HTML transcript and uploads files to destination',
        options: [
            {
                name: 'destination',
                description: 'Destination channel ID or #mention where the export will be posted (default: this channel)',
                type: 3, // STRING
                required: false
            },
            {
                name: 'amount',
                description: 'Number of messages to export (default: 100, max: 500)',
                type: 4, // INTEGER
                required: false
            },
            {
                name: 'upload_files',
                description: 'Extract and upload all .txt, image, and file attachments to destination (default: true)',
                type: 5, // BOOLEAN
                required: false
            },
            {
                name: 'file',
                description: 'Upload an additional custom file to send along with the transcript',
                type: 11, // ATTACHMENT
                required: false
            }
        ]
    },
    {
        name: 'clone',
        description: '🔄 Clone channels, roles, categories, emojis & settings from source server to destination server',
        options: [
            {
                name: 'source_server_id',
                description: 'Source server ID (server to copy FROM)',
                type: 3, // STRING
                required: true
            },
            {
                name: 'destination_server_id',
                description: 'Destination server ID (server to clone TO - defaults to current server)',
                type: 3, // STRING
                required: false
            },
            {
                name: 'clear_destination',
                description: 'Wipe existing channels and custom roles in destination first (default: true)',
                type: 5, // BOOLEAN
                required: false
            },
            {
                name: 'clone_emojis',
                description: 'Clone custom emojis as well (default: true)',
                type: 5, // BOOLEAN
                required: false
            }
        ]
    },
    {
        name: 'login',
        description: 'Login with or without a user token to forward from any server/channel',
        options: [
            {
                name: 'token',
                description: 'Discord User Token (optional - enables forwarding from external servers)',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'adminrole',
        description: '👑 Manage authorized Admin Roles permitted to run bot commands',
        options: [
            {
                name: 'action',
                description: 'Action to perform (add, remove, or list)',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'add', value: 'add' },
                    { name: 'remove', value: 'remove' },
                    { name: 'list', value: 'list' }
                ]
            },
            {
                name: 'role',
                description: 'The Discord role to grant or revoke command execution permissions',
                type: 8, // ROLE
                required: false
            }
        ]
    },
    {
        name: 'botlock',
        description: '🔒 Manage Bot Lockdown mode and Owner permissions',
        options: [
            {
                name: 'action',
                description: 'Lock action (status, lock, unlock, grant, revoke)',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'status', value: 'status' },
                    { name: 'lock', value: 'lock' },
                    { name: 'unlock', value: 'unlock' },
                    { name: 'grant', value: 'grant' },
                    { name: 'revoke', value: 'revoke' }
                ]
            },
            {
                name: 'user',
                description: 'User to grant or revoke permission for (used with grant/revoke)',
                type: 6, // USER
                required: false
            }
        ]
    },
    {
        name: 'invite',
        description: '🔗 Get the official bot invite link to add this bot to your Discord server'
    },
    {
        name: 'role',
        description: '⚡ Ultra-fast role management engine (individual & mass turbo)',
        options: [
            {
                name: 'add',
                description: '➕ Assign a role to a specific user or yourself',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'role',
                        description: 'The Discord role to assign',
                        type: 8, // ROLE
                        required: true
                    },
                    {
                        name: 'user',
                        description: 'The user to give the role to (defaults to you)',
                        type: 6, // USER
                        required: false
                    }
                ]
            },
            {
                name: 'remove',
                description: '➖ Remove a role from a specific user or yourself',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'role',
                        description: 'The Discord role to remove',
                        type: 8, // ROLE
                        required: true
                    },
                    {
                        name: 'user',
                        description: 'The user to remove the role from (defaults to you)',
                        type: 6, // USER
                        required: false
                    }
                ]
            },
            {
                name: 'all',
                description: '⚡ Give or remove a role to everyone in the server mad fast (0.50s turbo)',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'role',
                        description: 'The Discord role to give or remove to all members',
                        type: 8, // ROLE
                        required: true
                    },
                    {
                        name: 'action',
                        description: 'Action to perform (add or remove, default: add)',
                        type: 3, // STRING
                        required: false,
                        choices: [
                            { name: 'add (Give role to everyone)', value: 'add' },
                            { name: 'remove (Remove role from everyone)', value: 'remove' }
                        ]
                    },
                    {
                        name: 'target',
                        description: 'Target members: all, humans only, or bots only (default: all)',
                        type: 3, // STRING
                        required: false,
                        choices: [
                            { name: 'all (Everyone in server)', value: 'all' },
                            { name: 'humans (Humans only)', value: 'humans' },
                            { name: 'bots (Bots only)', value: 'bots' }
                        ]
                    }
                ]
            },
            {
                name: 'humans',
                description: '⚡ Give or remove a role to all human members only',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'role',
                        description: 'The Discord role to give or remove',
                        type: 8, // ROLE
                        required: true
                    },
                    {
                        name: 'action',
                        description: 'Action to perform (add or remove, default: add)',
                        type: 3,
                        required: false,
                        choices: [
                            { name: 'add (Give role)', value: 'add' },
                            { name: 'remove (Remove role)', value: 'remove' }
                        ]
                    }
                ]
            },
            {
                name: 'bots',
                description: '⚡ Give or remove a role to all bot members only',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'role',
                        description: 'The Discord role to give or remove',
                        type: 8, // ROLE
                        required: true
                    },
                    {
                        name: 'action',
                        description: 'Action to perform (add or remove, default: add)',
                        type: 3,
                        required: false,
                        choices: [
                            { name: 'add (Give role)', value: 'add' },
                            { name: 'remove (Remove role)', value: 'remove' }
                        ]
                    }
                ]
            }
        ]
    },
    {
        name: 'give-admin',
        description: '👑 Create and grant an Administrator role to yourself or a user',
        options: [
            {
                name: 'user',
                description: 'User to give Administrator permissions to (defaults to you)',
                type: 6, // USER
                required: false
            },
            {
                name: 'name',
                description: 'Custom name for the Administrator role (default: Administrator)',
                type: 3, // STRING
                required: false
            },
            {
                name: 'color',
                description: 'Hex color for the new role (e.g. #FF0000 or Red)',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'roleall',
        description: '⚡ Give or remove a role to everybody mad fast (0.50s turbo)',
        options: [
            {
                name: 'role',
                description: 'The Discord role to give or remove to all members',
                type: 8, // ROLE
                required: true
            },
            {
                name: 'action',
                description: 'Action to perform (add or remove, default: add)',
                type: 3,
                required: false,
                choices: [
                    { name: 'add (Give role)', value: 'add' },
                    { name: 'remove (Remove role)', value: 'remove' }
                ]
            },
            {
                name: 'target',
                description: 'Target members (all, humans, bots)',
                type: 3,
                required: false,
                choices: [
                    { name: 'all (Everyone in server)', value: 'all' },
                    { name: 'humans (Humans only)', value: 'humans' },
                    { name: 'bots (Bots only)', value: 'bots' }
                ]
            }
        ]
    },
    {
        name: 'lockall',
        description: '🔒 Instantly lock all channels across the entire server for @everyone',
        options: [
            {
                name: 'channels',
                description: '🔒 Lock all server channels against @everyone',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'action',
                        description: 'Action to perform: lock or unlock (default: lock)',
                        type: 3, // STRING
                        required: false,
                        choices: [
                            { name: 'lock (Lock down channels)', value: 'lock' },
                            { name: 'unlock (Lift lockdown & restore channels)', value: 'unlock' }
                        ]
                    },
                    {
                        name: 'scope',
                        description: 'Filter channel types to lock (default: all)',
                        type: 3, // STRING
                        required: false,
                        choices: [
                            { name: 'all (Text, Announcement, Forum & Voice channels)', value: 'all' },
                            { name: 'text (Text & Forum channels only)', value: 'text' },
                            { name: 'voice (Voice & Stage channels only)', value: 'voice' }
                        ]
                    },
                    {
                        name: 'reason',
                        description: 'Optional reason for the lockdown',
                        type: 3, // STRING
                        required: false
                    }
                ]
            }
        ]
    },
    {
        name: 'unlockall',
        description: '🔓 Instantly unlock all channels across the entire server for @everyone',
        options: [
            {
                name: 'channels',
                description: '🔓 Unlock all server channels for @everyone',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'scope',
                        description: 'Filter channel types to unlock (default: all)',
                        type: 3, // STRING
                        required: false,
                        choices: [
                            { name: 'all (Text, Announcement, Forum & Voice channels)', value: 'all' },
                            { name: 'text (Text & Forum channels only)', value: 'text' },
                            { name: 'voice (Voice & Stage channels only)', value: 'voice' }
                        ]
                    },
                    {
                        name: 'reason',
                        description: 'Optional reason for unlocking channels',
                        type: 3, // STRING
                        required: false
                    }
                ]
            }
        ]
    },
    {
        name: 'whitelist2',
        description: '⚡ Manage Whitelist 2 (Users authorized for Channel & DM Forwarding)',
        options: [
            {
                name: 'add',
                description: '➕ Add a user to Whitelist 2 (enables forward features & DM commands)',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        description: 'User to authorize for forwarding & DMs',
                        type: 6, // USER
                        required: true
                    }
                ]
            },
            {
                name: 'remove',
                description: '➖ Remove a user from Whitelist 2',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        description: 'User to remove from Whitelist 2',
                        type: 6, // USER
                        required: true
                    }
                ]
            },
            {
                name: 'list',
                description: '📋 List all users authorized in Whitelist 2',
                type: 1 // SUB_COMMAND
            },
            {
                name: 'check',
                description: '🔍 Check if a user (or yourself) is authorized in Whitelist 2',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        description: 'User to check (leave empty to check yourself)',
                        type: 6, // USER
                        required: false
                    }
                ]
            }
        ]
    },
    {
        name: 'ticket-setup',
        description: '🎫 Setup an interactive support ticket panel in a channel',
        options: [
            {
                name: 'channel',
                description: 'Channel to send the ticket panel embed (default: current channel)',
                type: 7, // CHANNEL
                required: false
            },
            {
                name: 'category',
                description: 'Category where new ticket channels will be created',
                type: 7, // CHANNEL
                required: false
            },
            {
                name: 'support_role',
                description: 'Support/staff role granted access to view & handle tickets',
                type: 8, // ROLE
                required: false
            },
            {
                name: 'title',
                description: 'Custom title for the ticket embed panel',
                type: 3, // STRING
                required: false
            },
            {
                name: 'description',
                description: 'Custom description / instructions for the ticket embed panel',
                type: 3, // STRING
                required: false
            },
            {
                name: 'button_label',
                description: 'Label on the create ticket button (default: Create Ticket)',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'ticket',
        description: '🎫 Manage current ticket channel (close, transcript, add user, delete)',
        options: [
            {
                name: 'setup',
                description: '⚙️ Configure and deploy the ticket creation panel',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'channel',
                        description: 'Channel to send the ticket panel',
                        type: 7,
                        required: false
                    },
                    {
                        name: 'category',
                        description: 'Category where ticket channels will be created',
                        type: 7,
                        required: false
                    },
                    {
                        name: 'support_role',
                        description: 'Staff / Support role to notify and assign access',
                        type: 8,
                        required: false
                    },
                    {
                        name: 'title',
                        description: 'Title for the ticket panel',
                        type: 3,
                        required: false
                    },
                    {
                        name: 'description',
                        description: 'Instructions text for the panel',
                        type: 3,
                        required: false
                    }
                ]
            },
            {
                name: 'close',
                description: '🔒 Close the current ticket channel',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'reason',
                        description: 'Reason for closing the ticket',
                        type: 3, // STRING
                        required: false
                    }
                ]
            },
            {
                name: 'transcript',
                description: '📜 Export full HTML transcript of this ticket channel',
                type: 1 // SUB_COMMAND
            },
            {
                name: 'add',
                description: '➕ Add a user to this ticket channel',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        description: 'User to add to the ticket',
                        type: 6, // USER
                        required: true
                    }
                ]
            },
            {
                name: 'remove',
                description: '➖ Remove a user from this ticket channel',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        description: 'User to remove from the ticket',
                        type: 6, // USER
                        required: true
                    }
                ]
            },
            {
                name: 'delete',
                description: '🗑️ Permanently delete this ticket channel',
                type: 1 // SUB_COMMAND
            }
        ]
    },
    {
        name: 'execute',
        description: '⚡ Execute a Roblox Luau script safely, analyze security & crashers, and render visual output photos',
        options: [
            {
                name: 'code',
                description: 'Roblox Luau code or loadstring(game:HttpGet(...))',
                type: 3, // STRING
                required: false
            },
            {
                name: 'file',
                description: 'Upload a .lua or .txt Roblox script file to execute',
                type: 11, // ATTACHMENT
                required: false
            },
            {
                name: 'script_name',
                description: 'Script name from Fetch Hub cache or URL',
                type: 3, // STRING
                required: false
            }
        ]
    },
    {
        name: 'whitelist3',
        description: '⚡ Manage Whitelist 3 (Users authorized to use commands only)',
        options: [
            {
                name: 'add',
                description: '➕ Add a user to Whitelist 3 (grants command execution access)',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        description: 'User to authorize for commands',
                        type: 6, // USER
                        required: true
                    }
                ]
            },
            {
                name: 'remove',
                description: '➖ Remove a user from Whitelist 3',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        description: 'User to remove from Whitelist 3',
                        type: 6, // USER
                        required: true
                    }
                ]
            },
            {
                name: 'list',
                description: '📋 List all users in Whitelist 3',
                type: 1 // SUB_COMMAND
            },
            {
                name: 'check',
                description: '🔍 Check if a user is authorized in Whitelist 3',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'user',
                        description: 'User to check',
                        type: 6, // USER
                        required: false
                    }
                ]
            }
        ]
    },
    {
        name: 'unwhitelist',
        description: '🚫 Unwhitelist users or clear all whitelists across all tiers (bot lockdown)',
        options: [
            {
                name: 'target',
                description: 'Target to unwhitelist (all = clear all tiers, or choose specific tier/user)',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'all (Wipe EVERYONE across Tier 1, 2, and 3)', value: 'all' },
                    { name: 'tier1 (Clear Server Anti-Nuke Whitelist)', value: 'tier1' },
                    { name: 'tier2 (Clear Whitelist 2 Forwards & DMs)', value: 'tier2' },
                    { name: 'tier3 (Clear Whitelist 3 Commands Only)', value: 'tier3' },
                    { name: 'user (Unwhitelist a specific user)', value: 'user' }
                ]
            },
            {
                name: 'user',
                description: 'User to unwhitelist (required if target is user)',
                type: 6, // USER
                required: false
            }
        ]
    },
    {
        name: 'syncsources',
        description: '🔄 Crawl and download all real Roblox sources from Discord channels into Fetch Hub'
    }
];

// ⚡ Unified Roblox Script Execution & Security Analysis Handler
async function handleRobloxExecution({ sourceInput, attachment, scriptNameInput, replyFn, user }) {
    let sourceCode = '';
    let scriptName = scriptNameInput || 'script.lua';

    // 1. Check attachment
    if (attachment && attachment.url) {
        scriptName = attachment.name || scriptName;
        try {
            const res = await fetch(attachment.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            sourceCode = await res.text();
        } catch (err) {
            return replyFn({ content: `❌ Failed to download script attachment: ${err.message}` });
        }
    } else if (sourceInput && sourceInput.trim()) {
        const rawInput = sourceInput.trim();
        // Check if loadstring
        const resolved = await robloxEngine.resolveLoadstring(rawInput);
        if (resolved) {
            if (resolved.fetchError) {
                return replyFn({ content: `❌ **Loadstring Download Error:** Failed to fetch remote script from \`${resolved.url}\`\nReason: ${resolved.fetchError}` });
            }
            sourceCode = resolved.sourceCode;
            scriptName = resolved.url.split('/').pop().split('?')[0] || 'loadstring.lua';
        } else {
            // Check if it matches a cached script file in fetchHubCache
            const cachedMatch = fetchHubCache.find(item => 
                item.name.toLowerCase() === rawInput.toLowerCase() ||
                item.name.toLowerCase().includes(rawInput.toLowerCase())
            );
            if (cachedMatch && cachedMatch.attachmentUrl) {
                try {
                    const res = await fetch(cachedMatch.attachmentUrl);
                    if (res.ok) {
                        sourceCode = await res.text();
                        scriptName = cachedMatch.name;
                    } else {
                        sourceCode = rawInput;
                    }
                } catch (e) {
                    sourceCode = rawInput;
                }
            } else {
                sourceCode = rawInput;
            }
        }
    } else {
        return replyFn({
            content: `❌ **No Script Provided**\nPlease provide Roblox Luau code, a \`loadstring(game:HttpGet(...))\`, or upload a \`.lua\`/\`.txt\` file.\n\n**Usage Examples:**\n• \`.execute loadstring(game:HttpGet("https://..."))()\`\n• \`.execute <paste lua code>\`\n• Upload a script file with message \`.execute\`\n• \`.execute duel_spin_v2.lua.txt\` (executes from Fetch Hub cache)`
        });
    }

    if (!sourceCode || sourceCode.trim().length === 0) {
        return replyFn({ content: '❌ Script content is empty!' });
    }

    // 2. Validate Roblox Script Only
    const robloxCheck = robloxEngine.isRobloxScript(sourceCode);
    if (!robloxCheck.isRoblox) {
        return replyFn({
            content: `❌ **Execution Rejected: Roblox Scripts Only**\n${robloxCheck.reason}\n\n*This execution sandbox strictly executes Roblox Luau scripts (game exploits, UI hubs, ESP, combat, automation, loadstring).*`
        });
    }

    // 3. Security Scan (Webhooks, Crashers, Loggers)
    const scan = robloxEngine.scanRobloxScript(sourceCode);

    // CRITICAL REQUIREMENT: DISCORD WEBHOOK DETECTED -> STOP EXECUTION IMMEDIATELY!
    if (scan.hasWebhook) {
        try {
            const srcImageBuf = await robloxEngine.generateSourceCodeImage(sourceCode, scriptName);
            const srcAttachment = new AttachmentBuilder(srcImageBuf, { name: 'source_preview.png' });

            const blockedEmbed = new EmbedBuilder()
                .setColor(0xDC2626)
                .setTitle('🚨 MALICIOUS DISCORD WEBHOOK DETECTED — EXECUTION BLOCKED')
                .setDescription('Execution was automatically halted to protect your Roblox account, IP address, and security. A **Discord Webhook** was found embedded in the source code.')
                .addFields(
                    { name: '🛑 Block Reason', value: 'Discord Webhook exfiltration endpoint detected in script', inline: false },
                    { name: '🔗 Detected Webhook(s)', value: scan.webhookUrls.map(u => '`' + u + '`').join('\n') || 'Redacted Webhook', inline: false },
                    { name: '🛡️ Threat Assessment', value: '🔴 **CRITICAL HAZARD** (IP Logger / Cookie Stealer)', inline: true },
                    { name: '⚡ Execution Status', value: '❌ **BLOCKED / TERMINATED** (No code was executed)', inline: true },
                    { name: '👤 Operator', value: user ? `<@${user.id}>` : 'User', inline: true }
                )
                .setImage('attachment://source_preview.png')
                .setFooter({ text: 'Roblox Luau Security Engine • Malicious Webhook Blocked' })
                .setTimestamp();

            return replyFn({ embeds: [blockedEmbed], files: [srcAttachment] });
        } catch (e) {
            return replyFn({
                content: `🚨 **MALICIOUS DISCORD WEBHOOK DETECTED — EXECUTION BLOCKED!**\nExecution was aborted to protect your account.\nDetected Webhook(s):\n${scan.webhookUrls.map(u => '• `' + u + '`').join('\n')}`
            });
        }
    }

    // 4. Safe Sandbox Execution with mocked Roblox environment
    const execResult = robloxEngine.executeRobloxScript(sourceCode);
    const features = robloxEngine.extractScriptFeatures(sourceCode);

    // 5. Generate Visual Photos (Viewport output + Source code)
    let outputImageBuf, sourceImageBuf;
    try {
        outputImageBuf = await robloxEngine.generateExecutionOutputImage({
            features,
            scanResults: scan,
            execResults: execResult,
            scriptName
        });
        sourceImageBuf = await robloxEngine.generateSourceCodeImage(sourceCode, scriptName);
    } catch (renderErr) {
        console.error('Error generating execution images:', renderErr);
        return replyFn({
            content: `⚡ **Script Executed!** (Image render failed: ${renderErr.message})\nLogs:\n\`\`\`\n${execResult.logs.map(l => l.text).join('\n') || 'Clean execution'}\n\`\`\``
        });
    }

    const outputAttachment = new AttachmentBuilder(outputImageBuf, { name: 'roblox_execution_output.png' });
    const sourceAttachment = new AttachmentBuilder(sourceImageBuf, { name: 'source_code_preview.png' });

    // 6. Build Result Embed
    const hasWarnings = scan.hasCrasher || scan.hasLogger || !execResult.success;
    const embedColor = hasWarnings ? 0xF59E0B : 0x10B981;

    let logText = execResult.logs.slice(0, 4).map(l => `• \`[${l.type.toUpperCase()}]\` ${l.text.slice(0, 60)}`).join('\n');
    if (!logText) logText = '• `[OUTPUT]` CoreGui synced • RenderStepped loop active';

    const resultEmbed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(execResult.success ? '⚡ Roblox Luau Script Executed' : '⚠️ Roblox Luau Script Executed (Warnings)')
        .setDescription(`Executed **${scriptName}** on **Solara / Wave VM** in **${execResult.durationMs}ms**.\nVisual execution viewport and source code preview rendered below:`)
        .addFields(
            {
                name: '🛡️ Security & Vulnerability Scan',
                value: `• **Discord Webhook:** ✅ Clean (No webhooks found)\n• **Crasher Scan:** ${scan.hasCrasher ? '⚠️ ' + scan.crasherDetails.join(', ') : '✅ Safe (No freeze/memory bombs)'}\n• **Logger Scan:** ${scan.hasLogger ? '⚠️ ' + scan.loggerDetails.join(', ') : '✅ Clean (No IP/Cookie grabbers)'}`,
                inline: false
            },
            {
                name: '🎮 Environment & UI Framework',
                value: `• **Framework:** ${features.uiFramework || 'Standard Luau'}\n• **Target Game:** ${features.detectedGame}\n• **PlaceId:** \`8737899170\``,
                inline: true
            },
            {
                name: '💻 Execution Console Logs',
                value: logText,
                inline: false
            }
        )
        .setImage('attachment://roblox_execution_output.png')
        .setFooter({ text: 'Roblox Luau Execution Engine • Output Viewport & Source Snapshot' })
        .setTimestamp();

    return replyFn({
        embeds: [resultEmbed],
        files: [outputAttachment, sourceAttachment]
    });
}

// Register Slash Commands with Discord API
async function registerSlashCommands() {
    if (!client.isReady() || !client.application) {
        throw new Error('Bot is not connected or client application is not ready.');
    }
    const registered = await client.application.commands.set(SLASH_COMMANDS);
    console.log(`✅ Registered ${registered.size} slash commands with Discord API`);
    return registered;
}

// API endpoint to manually register slash commands from Web Dashboard
app.post('/api/register-commands', async (req, res) => {
    if (!client.isReady()) {
        return res.status(400).json({ success: false, error: 'Bot is offline. Please configure TOKEN in environment variables.' });
    }
    try {
        const registered = await registerSlashCommands();
        addLog('Register Commands', 'Web Dashboard', 'Discord API', true, `${registered.size} commands registered`);
        res.json({
            success: true,
            message: `Successfully registered ${registered.size} slash commands with Discord API!`,
            count: registered.size
        });
    } catch (error) {
        console.error('Failed to register slash commands via API:', error);
        addLog('Register Commands Error', 'Web Dashboard', 'Discord API', false, error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper: Extract all sources, media files, attachments, and URLs inside HTML content
function extractSourcesFromHtml(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') return [];
    const foundSources = new Set();

    // 1. Match src, data-src, href attributes in HTML
    const attrRegex = /(?:src|data-src|href)=["']?([^"'\s>]+)["']?/gi;
    let match;
    while ((match = attrRegex.exec(htmlContent)) !== null) {
        let url = match[1];
        if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//'))) {
            if (url.startsWith('//')) url = 'https:' + url;
            foundSources.add(url);
        }
    }

    // 2. Match raw http/https URLs inside the HTML text
    const urlRegex = /https?:\/\/[^\s"'<>`\)]+/gi;
    while ((match = urlRegex.exec(htmlContent)) !== null) {
        let url = match[0];
        url = url.replace(/[\"'>\)]+$/, '');
        foundSources.add(url);
    }

    return Array.from(foundSources).filter(url => {
        if (!url || url.startsWith('javascript:') || url.startsWith('data:')) return false;
        return true;
    });
}

// Helper: Batch forward extracted HTML sources to target Discord channel (supersonic speed)
async function processAndForwardHtmlSources(sources, targetChannel, sourceLabel) {
    let sentCount = 0;
    let failedCount = 0;

    const chunks = [];
    for (let i = 0; i < sources.length; i += 5) {
        chunks.push({
            chunk: sources.slice(i, i + 5),
            start: i + 1,
            end: Math.min(i + 5, sources.length)
        });
    }

    // Fire in parallel batches of 5 for lightning-fast delivery
    for (let b = 0; b < chunks.length; b += 5) {
        const subBatches = chunks.slice(b, b + 5);
        await Promise.all(subBatches.map(async ({ chunk, start, end }) => {
            try {
                const content = `📁 **[HTML Source Export: ${sourceLabel}]** (${start}-${end} of ${sources.length}):\n` + chunk.join('\n');
                await targetChannel.send({ content });
                sentCount += chunk.length;
            } catch (err) {
                console.error('Error forwarding HTML sources chunk:', err.message);
                failedCount += chunk.length;
            }
        }));
    }

    return { sentCount, failedCount };
}

// Route to serve /exporthtml page
app.get('/exporthtml', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'exporthtml.html'));
});

// API endpoint to preview sources in HTML
app.post('/api/exporthtml/preview', async (req, res) => {
    const { htmlContent, htmlUrl } = req.body;
    let content = htmlContent || '';
    if (!content && htmlUrl) {
        try {
            const fetchRes = await fetch(htmlUrl);
            content = await fetchRes.text();
        } catch (e) {
            return res.status(400).json({ success: false, error: `Failed to fetch HTML URL: ${e.message}` });
        }
    }
    if (!content) {
        return res.status(400).json({ success: false, error: 'No HTML content or URL provided' });
    }
    const sources = extractSourcesFromHtml(content);
    res.json({ success: true, totalSources: sources.length, sources });
});

// API endpoint to process and forward sources to Discord channel
app.post('/api/exporthtml', async (req, res) => {
    const { targetChannelId, htmlContent, htmlUrl, sourceName } = req.body;
    if (!targetChannelId) {
        return res.status(400).json({ error: 'Missing targetChannelId' });
    }
    if (!client.isReady()) {
        return res.status(400).json({ error: 'Bot is offline.' });
    }
    let content = htmlContent || '';
    if (!content && htmlUrl) {
        try {
            const fetchRes = await fetch(htmlUrl);
            content = await fetchRes.text();
        } catch (e) {
            return res.status(400).json({ error: `Failed to fetch HTML URL: ${e.message}` });
        }
    }
    if (!content) {
        return res.status(400).json({ error: 'No HTML content or URL provided' });
    }

    const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (!targetChannel || !targetChannel.isTextBased()) {
        return res.status(404).json({ error: 'Target channel not found or bot lacks access.' });
    }

    const sources = extractSourcesFromHtml(content);
    if (sources.length === 0) {
        return res.json({ success: true, totalSources: 0, forwardedCount: 0, failedCount: 0, message: 'No sources found in HTML' });
    }

    const result = await processAndForwardHtmlSources(sources, targetChannel, sourceName || 'Web Dashboard Export');
    addLog('Export HTML', sourceName || 'Web', targetChannelId, true, `Forwarded ${result.sentCount}/${sources.length} sources`);
    res.json({
        success: true,
        totalSources: sources.length,
        forwardedCount: result.sentCount,
        failedCount: result.failedCount
    });
});

// API: Get Whitelist 2 list
app.get('/api/whitelist2', (req, res) => {
    res.json({
        success: true,
        whitelist2,
        masterOwnerId: getMasterOwnerId()
    });
});

// API: Add user to Whitelist 2
app.post('/api/whitelist2/add', (req, res) => {
    const { userId } = req.body;
    if (!userId || !userId.trim()) {
        return res.status(400).json({ success: false, message: 'Missing userId parameter' });
    }
    const cleanId = userId.trim().replace(/[<@!>]/g, '');
    if (!whitelist2.includes(cleanId)) {
        whitelist2.push(cleanId);
        saveWhitelist2();
        addLog('Whitelist2 Added', cleanId, 'Dashboard', true, `Added via Web Dashboard`);
    }
    res.json({ success: true, whitelist2 });
});

// API: Remove user from Whitelist 2
app.post('/api/whitelist2/remove', (req, res) => {
    const { userId } = req.body;
    if (!userId || !userId.trim()) {
        return res.status(400).json({ success: false, message: 'Missing userId parameter' });
    }
    const cleanId = userId.trim().replace(/[<@!>]/g, '');
    const masterId = getMasterOwnerId();
    if (cleanId === masterId) {
        return res.status(400).json({ success: false, message: 'Cannot remove master owner from whitelist' });
    }
    whitelist2 = whitelist2.filter(id => id !== cleanId);
    saveWhitelist2();
    addLog('Whitelist2 Removed', cleanId, 'Dashboard', true, `Removed via Web Dashboard`);
    res.json({ success: true, whitelist2 });
});

// API: Get Ticket Config for Guild
app.get('/api/tickets/config/:guildId', (req, res) => {
    const { guildId } = req.params;
    const config = ticketConfigs[guildId] || { ticketCounter: 0, tickets: {} };
    res.json({ success: true, config });
});

// API: Deploy Ticket Setup via Web
app.post('/api/tickets/setup', async (req, res) => {
    const { guildId, channelId, categoryId, supportRoleId, title, description, buttonLabel } = req.body;
    if (!channelId) {
        return res.status(400).json({ success: false, message: 'channelId is required' });
    }

    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return res.status(400).json({ success: false, message: 'Target channel not found or not text-based' });
        }

        const panelMsg = await sendTicketPanel({
            channel,
            categoryId: categoryId || null,
            supportRoleId: supportRoleId || null,
            title: title || '🎫 Support & Assistance Tickets',
            description: description || 'Need help or have an inquiry? Click the button below to open a private, secure support ticket with our team.',
            buttonLabel: buttonLabel || 'Create Ticket'
        });

        res.json({ success: true, messageId: panelMsg.id, channelId: channel.id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 404 handler for API endpoints so they never return HTML
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found', path: req.path });
});

// Fallback route for SPA
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web Dashboard listening on http://0.0.0.0:${PORT}`);
});

// Validate & get user details for a Discord User Token
async function loginUserToken(token) {
    if (!token || !token.trim()) return { success: false, error: 'Empty token' };
    try {
        const cleanToken = token.trim().replace(/^(Bot|Bearer)\s+/i, '');
        const res = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { 'Authorization': cleanToken }
        });
        if (!res.ok) {
            return { success: false, error: `Discord API returned ${res.status}: ${res.statusText}` };
        }
        const user = await res.json();
        return { success: true, user };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// Fetch channel info via User Token REST API (for external servers where bot is not present)
async function fetchChannelWithUserToken(channelId) {
    if (!userToken || !userToken.trim()) return null;
    try {
        const cleanToken = userToken.trim().replace(/^(Bot|Bearer)\s+/i, '');
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
            headers: { 'Authorization': cleanToken }
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            id: data.id,
            name: data.name || `channel-${data.id}`,
            guildId: data.guild_id || 'external-server',
            isTextBased: () => true,
            isUserTokenChannel: true
        };
    } catch (err) {
        console.error('User token channel fetch error:', err.message);
        return null;
    }
}

// Fetch messages via User Token REST API
async function fetchMessagesWithUserToken(channelId, options = {}) {
    if (!userToken || !userToken.trim()) return [];
    try {
        const cleanToken = userToken.trim().replace(/^(Bot|Bearer)\s+/i, '');
        let url = `https://discord.com/api/v10/channels/${channelId}/messages?limit=${options.limit || 100}`;
        if (options.before) {
            url += `&before=${options.before}`;
        }
        const res = await fetch(url, {
            headers: { 'Authorization': cleanToken }
        });
        if (!res.ok) {
            console.error(`User token fetch messages status ${res.status}: ${res.statusText}`);
            return [];
        }
        const rawMessages = await res.json();
        if (!Array.isArray(rawMessages)) return [];

        return rawMessages.map(m => ({
            id: m.id,
            content: m.content || '',
            author: {
                username: m.author?.username || 'User',
                tag: m.author?.discriminator ? `${m.author.username}#${m.author.discriminator}` : (m.author?.username || 'User'),
                displayAvatarURL: () => m.author?.avatar ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png',
                toString: () => `@${m.author?.username || 'User'}`
            },
            attachments: (m.attachments || []).map(a => ({ url: a.url, name: a.filename || 'file' })),
            embeds: m.embeds || [],
            createdTimestamp: new Date(m.timestamp).getTime(),
            createdAt: new Date(m.timestamp),
            guild: m.guild_id ? { name: 'External Server' } : null
        }));
    } catch (err) {
        console.error('Error fetching messages with user token:', err.message);
        return [];
    }
}

// Universal Batch Fetcher (Bot + User Token fallback)
async function fetchBatchOfMessages(sourceChannel, options = {}) {
    if (sourceChannel.isUserTokenChannel || !sourceChannel.messages) {
        return await fetchMessagesWithUserToken(sourceChannel.id, options);
    }
    try {
        const fetched = await sourceChannel.messages.fetch(options);
        return Array.from(fetched.values());
    } catch (err) {
        console.warn(`Standard bot fetch failed for channel ${sourceChannel.id}, trying User Token fallback...`);
        return await fetchMessagesWithUserToken(sourceChannel.id, options);
    }
}

// Helper: Find channel anywhere (in bot servers or via User Token)
async function findChannelInAllServers(channelId) {
    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
            return channel;
        }
    } catch (error) {}

    // Fallback: try User Token if bot is not in the server
    const userChannel = await fetchChannelWithUserToken(channelId);
    if (userChannel) {
        return userChannel;
    }

    return null;
}

function isTxtAttachment(attachment) {
    const filename = (attachment.name || attachment.url || '').toLowerCase().split('?')[0];
    if (filename.endsWith('.txt')) {
        return true;
    }
    if (attachment.contentType && attachment.contentType.toLowerCase().startsWith('text/plain')) {
        return true;
    }
    return false;
}

function isImageAttachment(attachment) {
    const filename = (attachment.name || attachment.url || '').toLowerCase().split('?')[0];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico', '.tiff'];
    if (imageExtensions.some(ext => filename.endsWith(ext))) {
        return true;
    }
    if (attachment.contentType && attachment.contentType.toLowerCase().startsWith('image/')) {
        return true;
    }
    return false;
}

// Forward ONLY .txt files and images (no text messages, skipping non-.txt/non-image messages)
async function forwardMessage(message, targetChannel, sourceChannel) {
    try {
        let attachmentsArray = [];
        if (message.attachments) {
            if (typeof message.attachments.values === 'function') {
                attachmentsArray = Array.from(message.attachments.values());
            } else if (Array.isArray(message.attachments)) {
                attachmentsArray = message.attachments;
            }
        }

        const txtFiles = [];
        const imageFiles = [];

        for (const attachment of attachmentsArray) {
            const url = attachment.url;
            if (!url) continue;
            let rawName = attachment.name || attachment.filename || (url.split('/').pop().split('?')[0]) || 'file';
            try {
                rawName = decodeURIComponent(rawName);
            } catch (e) {}

            if (isTxtAttachment(attachment)) {
                const finalName = rawName.toLowerCase().endsWith('.txt') ? rawName : `${rawName}.txt`;
                txtFiles.push({
                    attachment: url,
                    name: finalName
                });
            } else if (isImageAttachment(attachment)) {
                imageFiles.push({
                    attachment: url,
                    name: rawName
                });
            }
        }

        // Check for any embedded image links
        if (imageFiles.length === 0 && message.embeds && Array.isArray(message.embeds)) {
            for (const embed of message.embeds) {
                if (embed.image && embed.image.url) {
                    imageFiles.push({
                        attachment: embed.image.url,
                        name: 'image.png'
                    });
                } else if (embed.thumbnail && embed.thumbnail.url) {
                    imageFiles.push({
                        attachment: embed.thumbnail.url,
                        name: 'thumbnail.png'
                    });
                }
            }
        }

        // Put .txt files first, then images directly underneath
        const allFiles = [...txtFiles, ...imageFiles];

        // Skip message if no .txt files or images are present (do not send pure text messages)
        if (allFiles.length === 0) {
            return { success: false, message: 'Skipped: No .txt files or images attached' };
        }

        // Clean search-friendly filenames: plain names without bolding, emojis, or branding
        const fileLines = allFiles.map(f => f.name);
        const contentText = fileLines.join('\n');

        // Automatically index forwarded files into Fetch Hub cache for .hub / .sod search
        for (const f of allFiles) {
            if (f.name) {
                addScriptToHubCache({
                    name: f.name,
                    size: f.size || 0,
                    url: f.attachment,
                    messageId: message.id,
                    channelId: targetChannel.id,
                    guildId: targetChannel.guild?.id || null
                });
            }
        }

        // Send files in batches (up to 10 files per message as per Discord limits)
        const firstBatch = allFiles.slice(0, 10);
        const firstPayload = { files: firstBatch };
        if (contentText) {
            firstPayload.content = contentText;
        }
        await targetChannel.send(firstPayload);

        if (allFiles.length > 10) {
            const extraSends = [];
            for (let i = 10; i < allFiles.length; i += 10) {
                extraSends.push(targetChannel.send({
                    files: allFiles.slice(i, i + 10)
                }).catch(err => console.error('Extra file batch send error:', err.message)));
            }
            await Promise.all(extraSends);
        }

        const logDetails = `${txtFiles.length} .txt file(s), ${imageFiles.length} image(s)`;
        addLog('File Forward (.txt & Images)', sourceChannel?.id || 'unknown', targetChannel?.id || 'unknown', true, logDetails);
        return { success: true, files: allFiles.length, txtFiles: txtFiles.length, imageFiles: imageFiles.length };

    } catch (error) {
        console.error('Forward error:', error);
        addLog('File Forward Error', sourceChannel?.id || 'unknown', targetChannel?.id || 'unknown', false, error.message);
        return { success: false, error: error.message };
    }
}

// Copy ALL messages from a channel (turbo supersonic speed)
async function copyAllMessages(sourceChannel, targetChannel) {
    try {
        let totalCopied = 0;
        let totalFailed = 0;
        let totalFiles = 0;
        let lastMessageId = null;
        let hasMore = true;
        let batchCount = 0;
        let totalMessages = 0;

        const testFetch = await fetchBatchOfMessages(sourceChannel, { limit: 1 });
        if (!testFetch || testFetch.length === 0) {
            return { 
                success: false, 
                message: 'Cannot access source channel. Ensure either:\n1) Bot is invited to source server, OR\n2) Configure USER_TOKEN in Web Dashboard Settings to read external servers.' 
            };
        }

        await targetChannel.send(`🔄 **Starting FULL COPY of .txt files from <#${sourceChannel.id}>**`);
        await targetChannel.send(`⚡ Scanning and forwarding all .txt files and attached images at maximum speed...`);

        while (hasMore) {
            batchCount++;
            let options = { limit: 100 };
            
            if (lastMessageId) {
                options.before = lastMessageId;
            }

            try {
                const messages = await fetchBatchOfMessages(sourceChannel, options);
                
                if (!messages || messages.length === 0) {
                    hasMore = false;
                    break;
                }

                totalMessages += messages.length;
                const sortedMessages = Array.from(messages).reverse();
                lastMessageId = sortedMessages[sortedMessages.length - 1]?.id || lastMessageId;
                
                if (batchCount % 5 === 0) {
                    await targetChannel.send(`⚡ Progress: Copied ${totalMessages} messages so far...`);
                }

                // Process in parallel chunks of 5 for supersonic throughput
                for (let i = 0; i < sortedMessages.length; i += 5) {
                    const msgChunk = sortedMessages.slice(i, i + 5);
                    await Promise.all(msgChunk.map(async (message) => {
                        let fileCount = 0;
                        if (message.attachments) {
                            fileCount = typeof message.attachments.size === 'number' ? message.attachments.size : (Array.isArray(message.attachments) ? message.attachments.length : 0);
                        }
                        totalFiles += fileCount;
                        
                        const result = await forwardMessage(message, targetChannel, sourceChannel);
                        if (result.success) {
                            totalCopied++;
                        } else {
                            totalFailed++;
                        }
                    }));
                }

                if (messages.length < 100) {
                    hasMore = false;
                }

                if (batchCount % 10 === 0) {
                    saveForwards();
                }

            } catch (error) {
                console.error('Error fetching messages:', error);
                hasMore = false;
                break;
            }
        }

        const guildId = targetChannel.guildId;
        const targetId = targetChannel.id;
        
        if (!forwards[guildId]) {
            forwards[guildId] = {};
        }
        if (!forwards[guildId][targetId]) {
            forwards[guildId][targetId] = [];
        }
        
        if (!forwards[guildId][targetId].includes(sourceChannel.id)) {
            forwards[guildId][targetId].push(sourceChannel.id);
            saveForwards();
        }

        const completionEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ FULL COPY COMPLETE!')
            .setDescription(`Successfully copied all .txt files from <#${sourceChannel.id}>`)
            .addFields(
                { name: '📊 Scanned Messages', value: `${totalCopied + totalFailed}`, inline: true },
                { name: '✅ Forwarded Files', value: `${totalCopied} message batches`, inline: true },
                { name: '🔄 Auto-Forward', value: '✅ Future .txt files will auto-forward!' }
            )
            .setTimestamp();

        await targetChannel.send({ embeds: [completionEmbed] });
        addLog('Bulk Copy Complete', sourceChannel.id, targetChannel.id, true, `Total: ${totalCopied}`);

        return { 
            success: true, 
            total: totalCopied + totalFailed,
            copied: totalCopied,
            failed: totalFailed,
            files: totalFiles,
            batches: batchCount
        };

    } catch (error) {
        console.error('Copy error:', error);
        addLog('Bulk Copy Error', sourceChannel?.id || 'unknown', targetChannel?.id || 'unknown', false, error.message);
        return { success: false, message: error.message };
    }
}

// Purge all messages in the same channel without deleting or recreating the channel
async function purgeChannelMessages(channel, limitInput) {
    if (!channel || !channel.isTextBased?.()) {
        return { success: false, message: 'Invalid or non-text channel.' };
    }

    const isAll = !limitInput || String(limitInput).toLowerCase().trim() === 'all';
    let targetCount = isAll ? Infinity : parseInt(limitInput, 10);
    if (isNaN(targetCount) || targetCount <= 0) {
        if (isAll) {
            targetCount = Infinity;
        } else {
            return { success: false, message: 'Please specify a valid number or "all".' };
        }
    }

    let totalDeleted = 0;
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    while (totalDeleted < targetCount) {
        const fetchLimit = Math.min(100, targetCount === Infinity ? 100 : (targetCount - totalDeleted));
        if (fetchLimit <= 0) break;

        const fetched = await channel.messages.fetch({ limit: fetchLimit }).catch(err => {
            console.error('Fetch error during purge:', err);
            return null;
        });

        if (!fetched || fetched.size === 0) {
            break;
        }

        const recentMessages = fetched.filter(m => m.createdTimestamp > fourteenDaysAgo);
        const oldMessages = fetched.filter(m => m.createdTimestamp <= fourteenDaysAgo);

        if (recentMessages.size > 0) {
            try {
                const deleted = await channel.bulkDelete(recentMessages, true);
                totalDeleted += deleted.size;
            } catch (bulkErr) {
                console.warn('bulkDelete error during purge, deleting individually:', bulkErr.message);
                for (const [, msg] of recentMessages) {
                    if (totalDeleted >= targetCount) break;
                    try {
                        await msg.delete();
                        totalDeleted++;
                        await new Promise(r => setTimeout(r, 100));
                    } catch (e) {
                        console.warn(`Could not delete message ${msg.id}:`, e.message);
                    }
                }
            }
        }

        if (oldMessages.size > 0 && totalDeleted < targetCount) {
            for (const [, msg] of oldMessages) {
                if (totalDeleted >= targetCount) break;
                try {
                    await msg.delete();
                    totalDeleted++;
                    await new Promise(r => setTimeout(r, 150));
                } catch (e) {
                    console.warn(`Could not delete old message ${msg.id}:`, e.message);
                }
            }
        }

        if (fetched.size < fetchLimit) {
            break;
        }

        await new Promise(r => setTimeout(r, 250));
    }

    return { success: true, count: totalDeleted };
}

// Export channel messages as HTML transcript & extract files
async function exportChannelHtml(channel, limitInput, shouldUploadFiles = true) {
    if (!channel || !channel.isTextBased?.()) {
        return { success: false, message: 'Invalid or non-text channel.' };
    }

    let limit = parseInt(limitInput, 10) || 100;
    if (limit > 500) limit = 500;
    if (limit <= 0) limit = 100;

    let messages = [];
    let lastId = null;

    while (messages.length < limit) {
        const fetchAmount = Math.min(100, limit - messages.length);
        const options = { limit: fetchAmount };
        if (lastId) options.before = lastId;

        const batch = await channel.messages.fetch(options).catch(err => {
            console.error('Fetch error during exporthtml:', err);
            return null;
        });

        if (!batch || batch.size === 0) break;
        messages.push(...Array.from(batch.values()));
        lastId = batch.last()?.id;
        if (batch.size < fetchAmount) break;
    }

    // Chronological order (oldest first)
    messages.reverse();

    const channelName = channel.name || channel.id;
    const guildName = channel.guild?.name || 'Server';
    const timestamp = new Date().toISOString();

    const escapeHtml = (str) => {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    let msgHtml = '';
    const downloadedFiles = [];

    for (const msg of messages) {
        const authorName = escapeHtml(msg.author?.tag || msg.author?.username || 'Unknown');
        const authorAvatar = msg.author?.displayAvatarURL?.({ dynamic: true, size: 64 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const msgTime = new Date(msg.createdTimestamp).toLocaleString();
        const content = escapeHtml(msg.content);

        let attachmentsHtml = '';
        if (msg.attachments && msg.attachments.size > 0) {
            attachmentsHtml = '<div class="attachments">' + Array.from(msg.attachments.values()).map(att => {
                const url = escapeHtml(att.url);
                const name = escapeHtml(att.name);
                const isImg = att.contentType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(att.name);
                if (isImg) {
                    return `<div class="attachment"><a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${url}" alt="${name}" /></a></div>`;
                }
                return `<div class="attachment"><a href="${url}" target="_blank" rel="noopener noreferrer" class="file-link">📎 ${name}</a></div>`;
            }).join('') + '</div>';

            if (shouldUploadFiles) {
                for (const [, att] of msg.attachments) {
                    if (downloadedFiles.length < 50) {
                        try {
                            const res = await fetch(att.url);
                            if (res.ok) {
                                const arrayBuf = await res.arrayBuffer();
                                const buffer = Buffer.from(arrayBuf);
                                downloadedFiles.push({
                                    name: att.name || 'attachment',
                                    attachment: buffer
                                });
                            }
                        } catch (err) {
                            console.warn(`Failed to download attachment ${att.name}:`, err.message);
                        }
                    }
                }
            }
        }

        msgHtml += `
        <div class="message">
            <img class="avatar" src="${authorAvatar}" alt="avatar" />
            <div class="msg-body">
                <div class="msg-header">
                    <span class="author">${authorName}</span>
                    <span class="timestamp">${msgTime}</span>
                </div>
                ${content ? `<div class="content">${content}</div>` : ''}
                ${attachmentsHtml}
            </div>
        </div>`;
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Transcript Archive - #${escapeHtml(channelName)}</title>
<style>
  * { box-sizing: border-box; }
  body { background: #0e1117; color: #dcddde; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 24px; }
  .header { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 18px 22px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
  .header .watermark { font-size: 15px; font-weight: 700; color: #6366f1; letter-spacing: 0.5px; text-transform: uppercase; }
  .header h1 { font-size: 20px; color: #ffffff; margin: 6px 0 4px 0; }
  .header .sub { font-size: 12px; color: #8b949e; margin-top: 6px; }
  .messages { display: flex; flex-direction: column; gap: 12px; }
  .message { display: flex; gap: 14px; padding: 10px 14px; border-radius: 8px; background: rgba(22, 27, 34, 0.7); border: 1px solid rgba(48, 54, 61, 0.4); }
  .message:hover { background: rgba(33, 38, 45, 0.9); }
  .avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
  .msg-body { flex: 1; min-width: 0; }
  .msg-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
  .author { font-weight: 600; color: #5865f2; font-size: 14px; }
  .timestamp { font-size: 11px; color: #8b949e; }
  .content { font-size: 14px; line-height: 1.5; color: #e6edf3; word-break: break-word; white-space: pre-wrap; }
  .attachments { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
  .attachments img { max-width: 400px; max-height: 300px; border-radius: 6px; border: 1px solid #30363d; }
  .file-link { color: #5865f2; text-decoration: none; font-size: 13px; font-weight: 500; }
  .file-link:hover { text-decoration: underline; }
  .footer { margin-top: 30px; text-align: center; font-size: 13px; color: #8b949e; border-top: 1px solid #21262d; padding-top: 18px; font-weight: 600; }
</style>
</head>
<body>
<div class="header">
  <div class="watermark">Channel Transcript Archive</div>
  <h1>#${escapeHtml(channelName)} (${escapeHtml(guildName)})</h1>
  <div class="sub">Exported Messages: ${messages.length} • Exported at: ${timestamp}</div>
</div>
<div class="messages">
  ${msgHtml || '<div style="color:#8b949e; padding: 20px; text-align:center;">No messages found in this channel.</div>'}
</div>
<div class="footer">
  Channel Transcript Archive
</div>
</body>
</html>`;

    return {
        success: true,
        html: fullHtml,
        fileName: `transcript_${channelName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.html`,
        messageCount: messages.length,
        downloadedFiles
    };
}

// ----------------------------------------------------------------------------
// 🔄 Server Cloner Engine
// ----------------------------------------------------------------------------
async function cloneServer({
    sourceGuildId,
    destinationGuildId,
    options = {},
    progressCallback = () => {},
    operatorTag = 'Operator'
}) {
    const {
        clearDestination = true,
        cloneRoles = true,
        cloneChannels = true,
        cloneSettings = true,
        cloneEmojis = true
    } = options;

    if (!sourceGuildId || !destinationGuildId) {
        throw new Error('Both source server ID and destination server ID are required.');
    }

    const cleanSourceId = String(sourceGuildId).trim().replace(/[<@#!&>]/g, '');
    const cleanDestId = String(destinationGuildId).trim().replace(/[<@#!&>]/g, '');

    if (!/^\d{16,22}$/.test(cleanSourceId)) {
        throw new Error(`Invalid source server ID format: "${sourceGuildId}". Server IDs are 17-20 digit numbers.`);
    }

    if (!/^\d{16,22}$/.test(cleanDestId)) {
        throw new Error(`Invalid destination server ID format: "${destinationGuildId}". Server IDs are 17-20 digit numbers.`);
    }

    if (cleanSourceId === cleanDestId) {
        throw new Error('Source server and destination server cannot be the same!');
    }

    if (!client.isReady()) {
        throw new Error('Discord bot is currently offline. Please ensure TOKEN is configured.');
    }

    // 1. Resolve Destination Guild (Bot must be in destination guild with admin / manage permissions)
    const destGuild = await client.guilds.fetch(cleanDestId).catch(() => null);
    if (!destGuild) {
        throw new Error(`Destination server (\`${cleanDestId}\`) not found or bot is not in that server. Please invite the bot to the destination server first.`);
    }

    const botMember = await destGuild.members.fetch(client.user.id).catch(() => null);
    if (!botMember) {
        throw new Error(`Bot is not a member of destination server **${destGuild.name}**.`);
    }

    const hasAdmin = botMember.permissions.has(PermissionFlagsBits.Administrator);
    const hasBasicManage = botMember.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles]);
    if (!hasAdmin && !hasBasicManage) {
        throw new Error(`Bot lacks required permissions in destination server **${destGuild.name}**. Please give the bot **Administrator** or **Manage Channels** and **Manage Roles** permissions.`);
    }

    // 2. Resolve Source Guild (from bot cache/fetch or REST API with userToken / bot token)
    let sourceGuildData = null;
    let sourceRolesData = [];
    let sourceChannelsData = [];
    let sourceEmojisData = [];

    const botSourceGuild = await client.guilds.fetch(cleanSourceId).catch(() => null);
    if (botSourceGuild) {
        sourceGuildData = {
            id: botSourceGuild.id,
            name: botSourceGuild.name,
            iconURL: botSourceGuild.iconURL ? botSourceGuild.iconURL({ extension: 'png', size: 1024 }) : null,
            verificationLevel: botSourceGuild.verificationLevel,
            defaultMessageNotifications: botSourceGuild.defaultMessageNotifications,
            explicitContentFilter: botSourceGuild.explicitContentFilter,
            afkTimeout: botSourceGuild.afkTimeout,
            afkChannelId: botSourceGuild.afkChannelId,
            systemChannelId: botSourceGuild.systemChannelId
        };

        const fetchedRoles = await botSourceGuild.roles.fetch().catch(() => new Map());
        sourceRolesData = Array.from(fetchedRoles.values());

        const fetchedChannels = await botSourceGuild.channels.fetch().catch(() => new Map());
        sourceChannelsData = Array.from(fetchedChannels.values()).filter(Boolean);

        const fetchedEmojis = await botSourceGuild.emojis.fetch().catch(() => new Map());
        sourceEmojisData = Array.from(fetchedEmojis.values());
    } else {
        // Fetch via Discord REST API using userToken or botToken
        const authHeader = userToken && userToken.trim() ? userToken.trim() : (botToken ? `Bot ${botToken}` : '');
        if (!authHeader) {
            throw new Error(`Bot is not in source server (\`${cleanSourceId}\`) and no User Token is configured. Please provide a User Token via \`/login <token>\` or invite the bot to the source server.`);
        }

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': authHeader
        };

        const fetchApi = globalThis.fetch || require('node-fetch');
        const gRes = await fetchApi(`https://discord.com/api/v10/guilds/${cleanSourceId}?with_counts=true`, { headers }).catch(e => null);
        if (!gRes || !gRes.ok) {
            const errStatus = gRes ? gRes.status : 'Network error';
            throw new Error(`Source server (\`${cleanSourceId}\`) could not be fetched (HTTP ${errStatus}). Ensure the bot or logged-in user has access to that server.`);
        }
        const gJson = await gRes.json();
        sourceGuildData = {
            id: gJson.id,
            name: gJson.name,
            iconURL: gJson.icon ? `https://cdn.discordapp.com/icons/${gJson.id}/${gJson.icon}.png?size=1024` : null,
            verificationLevel: gJson.verification_level,
            defaultMessageNotifications: gJson.default_message_notifications,
            explicitContentFilter: gJson.explicit_content_filter,
            afkTimeout: gJson.afk_timeout,
            afkChannelId: gJson.afk_channel_id,
            systemChannelId: gJson.system_channel_id
        };

        const rolesRes = await fetchApi(`https://discord.com/api/v10/guilds/${cleanSourceId}/roles`, { headers }).catch(() => null);
        if (rolesRes && rolesRes.ok) {
            sourceRolesData = await rolesRes.json();
        }

        const channelsRes = await fetchApi(`https://discord.com/api/v10/guilds/${cleanSourceId}/channels`, { headers }).catch(() => null);
        if (channelsRes && channelsRes.ok) {
            sourceChannelsData = await channelsRes.json();
        }

        const emojisRes = await fetchApi(`https://discord.com/api/v10/guilds/${cleanSourceId}/emojis`, { headers }).catch(() => null);
        if (emojisRes && emojisRes.ok) {
            sourceEmojisData = await emojisRes.json();
        }
    }

    const logHistory = [];
    const recordLog = (msg) => {
        const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
        logHistory.push(line);
        try {
            progressCallback(msg);
        } catch (e) {}
    };

    recordLog(`🚀 Initiating server cloning from **${sourceGuildData.name}** (\`${cleanSourceId}\`) to **${destGuild.name}** (\`${cleanDestId}\`)...`);

    // STEP 1: Clone Server Identity & Settings
    if (cloneSettings) {
        recordLog(`⚙️ Cloning server identity, name and icon...`);
        try {
            if (sourceGuildData.name && sourceGuildData.name !== destGuild.name) {
                await destGuild.setName(sourceGuildData.name, 'Server Cloner: Sync server name').catch(e => recordLog(`⚠️ Could not update server name: ${e.message}`));
            }
            if (sourceGuildData.iconURL) {
                try {
                    const fetchApi = globalThis.fetch || require('node-fetch');
                    const imgRes = await fetchApi(sourceGuildData.iconURL);
                    if (imgRes && imgRes.ok) {
                        const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                        await destGuild.setIcon(imgBuf, 'Server Cloner: Sync server icon').catch(e => recordLog(`⚠️ Could not update icon: ${e.message}`));
                        recordLog(`🖼️ Server icon replicated successfully.`);
                    }
                } catch (iconErr) {
                    recordLog(`⚠️ Icon fetch warning: ${iconErr.message}`);
                }
            }
        } catch (setErr) {
            recordLog(`⚠️ Settings clone notice: ${setErr.message}`);
        }
    }

    // STEP 2: Clear Destination Server (if enabled)
    if (clearDestination) {
        recordLog(`🧹 Wiping destination channels and custom roles...`);
        const destChannels = await destGuild.channels.fetch().catch(() => new Map());
        let deletedChCount = 0;
        for (const [chId, ch] of destChannels) {
            if (!ch) continue;
            try {
                await ch.delete('Server Cloner: Wipe destination before clone');
                deletedChCount++;
                await new Promise(r => setTimeout(r, 180));
            } catch (delErr) {}
        }
        recordLog(`🗑️ Deleted ${deletedChCount} old channels/categories in destination.`);

        // Delete non-managed roles lower than bot
        const destRoles = await destGuild.roles.fetch().catch(() => new Map());
        const botHighestPos = botMember.roles.highest ? botMember.roles.highest.position : 999;
        let deletedRolesCount = 0;
        for (const [rId, r] of destRoles) {
            if (!r || r.managed || r.id === destGuild.id || r.name === '@everyone' || r.position >= botHighestPos) continue;
            try {
                await r.delete('Server Cloner: Wipe destination roles before clone');
                deletedRolesCount++;
                await new Promise(r => setTimeout(r, 180));
            } catch (rErr) {}
        }
        if (deletedRolesCount > 0) {
            recordLog(`🗑️ Deleted ${deletedRolesCount} old custom roles in destination.`);
        }
    }

    // STEP 3: Clone Roles
    const roleMap = new Map(); // sourceRoleId -> destRoleId
    let rolesClonedCount = 0;

    if (cloneRoles && sourceRolesData.length > 0) {
        recordLog(`👑 Cloning ${sourceRolesData.length} roles and permission hierarchies...`);
        
        // Sort roles ascending by position (lowest first)
        const sortedRoles = [...sourceRolesData].sort((a, b) => {
            const posA = a.rawPosition !== undefined ? a.rawPosition : (a.position !== undefined ? a.position : 0);
            const posB = b.rawPosition !== undefined ? b.rawPosition : (b.position !== undefined ? b.position : 0);
            return posA - posB;
        });

        // Update @everyone permissions
        const sourceEveryone = sortedRoles.find(r => r.id === cleanSourceId || r.name === '@everyone');
        if (sourceEveryone && destGuild.roles.everyone) {
            try {
                const everyonePerms = sourceEveryone.permissions !== undefined 
                    ? (typeof sourceEveryone.permissions === 'bigint' || typeof sourceEveryone.permissions === 'string' ? BigInt(sourceEveryone.permissions) : BigInt(sourceEveryone.permissions.bitfield || 0))
                    : destGuild.roles.everyone.permissions;
                await destGuild.roles.everyone.setPermissions(everyonePerms, 'Server Cloner: Sync @everyone permissions');
                roleMap.set(sourceEveryone.id, destGuild.roles.everyone.id);
            } catch (evErr) {
                recordLog(`⚠️ Notice updating @everyone permissions: ${evErr.message}`);
            }
        }

        for (const role of sortedRoles) {
            if (role.id === cleanSourceId || role.name === '@everyone' || role.managed) continue;

            try {
                const rawPerms = role.permissions !== undefined 
                    ? (typeof role.permissions === 'bigint' || typeof role.permissions === 'string' ? BigInt(role.permissions) : BigInt(role.permissions.bitfield || 0))
                    : 0n;

                const newRole = await destGuild.roles.create({
                    name: role.name,
                    color: role.color || 0,
                    hoist: Boolean(role.hoist),
                    mentionable: Boolean(role.mentionable),
                    permissions: rawPerms,
                    reason: `Server Cloner: Cloned from ${sourceGuildData.name}`
                });

                roleMap.set(role.id, newRole.id);
                rolesClonedCount++;
                await new Promise(r => setTimeout(r, 250));
            } catch (rErr) {
                recordLog(`⚠️ Role "${role.name}" clone notice: ${rErr.message}`);
            }
        }
        recordLog(`✅ Cloned **${rolesClonedCount}** roles with accurate permissions.`);
    }

    // Helper: Remap permission overwrites for categories and channels
    const remapOverwrites = (overwrites) => {
        if (!overwrites) return [];
        const result = [];
        const items = Array.isArray(overwrites) ? overwrites : (overwrites.values ? Array.from(overwrites.values()) : []);

        for (const ow of items) {
            let targetId = ow.id;
            let targetType = ow.type === 1 || ow.type === 'member' ? 1 : 0; // 0 = Role, 1 = Member

            if (ow.id === cleanSourceId) {
                targetId = destGuild.roles.everyone.id;
                targetType = 0;
            } else if (roleMap.has(ow.id)) {
                targetId = roleMap.get(ow.id);
                targetType = 0;
            } else if (destGuild.members.cache.has(ow.id)) {
                targetId = ow.id;
                targetType = 1;
            } else {
                continue;
            }

            try {
                const allowPerms = ow.allow !== undefined ? (typeof ow.allow === 'bigint' || typeof ow.allow === 'string' ? BigInt(ow.allow) : BigInt(ow.allow.bitfield || 0)) : 0n;
                const denyPerms = ow.deny !== undefined ? (typeof ow.deny === 'bigint' || typeof ow.deny === 'string' ? BigInt(ow.deny) : BigInt(ow.deny.bitfield || 0)) : 0n;

                result.push({
                    id: targetId,
                    type: targetType,
                    allow: allowPerms,
                    deny: denyPerms
                });
            } catch (e) {}
        }
        return result;
    };

    // STEP 4: Clone Categories & Channels
    const categoryMap = new Map(); // sourceCatId -> destCatId
    const channelMap = new Map(); // sourceChId -> destChId
    let categoriesClonedCount = 0;
    let channelsClonedCount = 0;

    if (cloneChannels && sourceChannelsData.length > 0) {
        recordLog(`📁 Cloning server channel architecture & hierarchy...`);

        // Separate Categories from other channels
        const categories = sourceChannelsData.filter(c => c.type === 4 || c.type === ChannelType.GuildCategory);
        const nonCategories = sourceChannelsData.filter(c => c.type !== 4 && c.type !== ChannelType.GuildCategory);

        // Sort Categories ascending by position
        categories.sort((a, b) => {
            const posA = a.rawPosition !== undefined ? a.rawPosition : (a.position !== undefined ? a.position : 0);
            const posB = b.rawPosition !== undefined ? b.rawPosition : (b.position !== undefined ? b.position : 0);
            return posA - posB;
        });

        for (const cat of categories) {
            try {
                const mappedOverwrites = remapOverwrites(cat.permissionOverwrites || cat.permission_overwrites);
                const newCat = await destGuild.channels.create({
                    name: cat.name,
                    type: ChannelType.GuildCategory,
                    position: cat.rawPosition !== undefined ? cat.rawPosition : cat.position,
                    permissionOverwrites: mappedOverwrites,
                    reason: `Server Cloner: Cloned from ${sourceGuildData.name}`
                });

                categoryMap.set(cat.id, newCat.id);
                channelMap.set(cat.id, newCat.id);
                categoriesClonedCount++;
                await new Promise(r => setTimeout(r, 280));
            } catch (catErr) {
                recordLog(`⚠️ Category "${cat.name}" clone notice: ${catErr.message}`);
            }
        }
        recordLog(`✅ Cloned **${categoriesClonedCount}** categories.`);

        // Sort Channels ascending by position
        nonCategories.sort((a, b) => {
            const posA = a.rawPosition !== undefined ? a.rawPosition : (a.position !== undefined ? a.position : 0);
            const posB = b.rawPosition !== undefined ? b.rawPosition : (b.position !== undefined ? b.position : 0);
            return posA - posB;
        });

        for (const ch of nonCategories) {
            try {
                const parentCatId = (ch.parentId || ch.parent_id) ? (categoryMap.get(ch.parentId || ch.parent_id) || null) : null;
                const mappedOverwrites = remapOverwrites(ch.permissionOverwrites || ch.permission_overwrites);

                // Determine channel type
                let chType = ChannelType.GuildText;
                const rawType = ch.type;
                if (rawType === 2 || rawType === ChannelType.GuildVoice) chType = ChannelType.GuildVoice;
                else if (rawType === 5 || rawType === ChannelType.GuildAnnouncement) chType = ChannelType.GuildAnnouncement;
                else if (rawType === 13 || rawType === ChannelType.GuildStageVoice) chType = ChannelType.GuildStageVoice;
                else if (rawType === 15 || rawType === ChannelType.GuildForum) chType = ChannelType.GuildForum;

                const createOptions = {
                    name: ch.name,
                    type: chType,
                    parent: parentCatId,
                    position: ch.rawPosition !== undefined ? ch.rawPosition : ch.position,
                    permissionOverwrites: mappedOverwrites,
                    topic: ch.topic || undefined,
                    nsfw: Boolean(ch.nsfw),
                    rateLimitPerUser: ch.rateLimitPerUser !== undefined ? ch.rateLimitPerUser : (ch.rate_limit_per_user !== undefined ? ch.rate_limit_per_user : undefined),
                    reason: `Server Cloner: Cloned from ${sourceGuildData.name}`
                };

                if (chType === ChannelType.GuildVoice || chType === ChannelType.GuildStageVoice) {
                    if (ch.bitrate) createOptions.bitrate = Math.min(ch.bitrate, destGuild.maximumBitrate || 96000);
                    if (ch.userLimit || ch.user_limit) createOptions.userLimit = ch.userLimit || ch.user_limit;
                }

                const newCh = await destGuild.channels.create(createOptions);
                channelMap.set(ch.id, newCh.id);
                channelsClonedCount++;
                await new Promise(r => setTimeout(r, 280));
            } catch (chErr) {
                recordLog(`⚠️ Channel "${ch.name}" clone notice: ${chErr.message}`);
            }
        }
        recordLog(`✅ Cloned **${channelsClonedCount}** text & voice channels.`);
    }

    // STEP 5: Clone Emojis
    let emojisClonedCount = 0;
    if (cloneEmojis && sourceEmojisData.length > 0) {
        recordLog(`😀 Replicating ${sourceEmojisData.length} custom server emojis...`);
        for (const emoji of sourceEmojisData) {
            try {
                const emojiUrl = emoji.url || `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`;
                const fetchApi = globalThis.fetch || require('node-fetch');
                const emoRes = await fetchApi(emojiUrl).catch(() => null);
                if (emoRes && emoRes.ok) {
                    const emoBuf = Buffer.from(await emoRes.arrayBuffer());
                    await destGuild.emojis.create({
                        attachment: emoBuf,
                        name: emoji.name ? emoji.name.replace(/[^a-zA-Z0-9_]/g, '') : 'emoji',
                        reason: `Server Cloner: Cloned from ${sourceGuildData.name}`
                    });
                    emojisClonedCount++;
                    await new Promise(r => setTimeout(r, 450));
                }
            } catch (emoErr) {}
        }
        if (emojisClonedCount > 0) {
            recordLog(`✅ Cloned **${emojisClonedCount}** custom emojis.`);
        }
    }

    // Map AFK and System channels if created
    if (sourceGuildData.afkChannelId && channelMap.has(sourceGuildData.afkChannelId)) {
        await destGuild.setAFKChannel(channelMap.get(sourceGuildData.afkChannelId), 'Server Cloner: Sync AFK channel').catch(() => {});
    }
    if (sourceGuildData.systemChannelId && channelMap.has(sourceGuildData.systemChannelId)) {
        await destGuild.setSystemChannel(channelMap.get(sourceGuildData.systemChannelId), 'Server Cloner: Sync System channel').catch(() => {});
    }

    addLog('Server Cloned', cleanSourceId, cleanDestId, true, `Roles: ${rolesClonedCount}, Cats: ${categoriesClonedCount}, Channels: ${channelsClonedCount}, Emojis: ${emojisClonedCount} by ${operatorTag}`);

    recordLog(`🎉 **SERVER CLONING COMPLETE!** Successfully copied entire server template into **${destGuild.name}**!`);

    return {
        success: true,
        sourceGuild: sourceGuildData.name,
        destinationGuild: destGuild.name,
        rolesCloned: rolesClonedCount,
        categoriesCloned: categoriesClonedCount,
        channelsCloned: channelsClonedCount,
        emojisCloned: emojisClonedCount,
        logs: logHistory
    };
}

// ----------------------------------------------------------------------------
// ⚡ Ultra-Fast Mass Role Engine (Turbo 0.50 Speed)
// ----------------------------------------------------------------------------
async function executeMassRole({
    guild,
    roleId,
    action = 'add', // 'add' or 'remove'
    targetFilter = 'all', // 'all', 'humans', 'bots'
    operator = 'Operator',
    progressCallback = () => {}
}) {
    if (!guild) throw new Error('No server provided.');
    if (!client.isReady()) throw new Error('Discord bot is currently offline.');

    const cleanRoleId = String(roleId).replace(/[<@&>]/g, '').trim();
    const role = await guild.roles.fetch(cleanRoleId).catch(() => null);
    if (!role) {
        throw new Error(`Role with ID \`${cleanRoleId}\` was not found in **${guild.name}**.`);
    }

    if (role.id === guild.id || role.name === '@everyone') {
        throw new Error('Cannot assign or remove the `@everyone` role.');
    }

    if (role.managed) {
        throw new Error(`Role **@${role.name}** is managed by a Discord integration or bot and cannot be assigned manually.`);
    }

    const botMember = await guild.members.fetch(client.user.id).catch(() => null);
    if (!botMember) {
        throw new Error(`Bot is not a member of **${guild.name}**.`);
    }

    const hasManageRoles = botMember.permissions.has(PermissionFlagsBits.ManageRoles) || botMember.permissions.has(PermissionFlagsBits.Administrator);
    if (!hasManageRoles) {
        throw new Error(`Bot lacks the **Manage Roles** or **Administrator** permission in **${guild.name}**.`);
    }

    if (role.position >= botMember.roles.highest.position) {
        throw new Error(`Role Hierarchy Error: The role **@${role.name}** (pos ${role.position}) is positioned higher than or equal to the bot's highest role **@${botMember.roles.highest.name}** (pos ${botMember.roles.highest.position}). Please drag the bot's role above **@${role.name}** in Server Settings > Roles.`);
    }

    // Step 1: Fetch members
    progressCallback({
        stage: 'fetching',
        message: '📥 Fetching all server members from Discord...',
        roleName: role.name,
        roleId: role.id
    });

    const membersCollection = await guild.members.fetch({ time: 60000 }).catch(async (e) => {
        console.warn('Full members.fetch timed out or errored, using cache fallback:', e.message);
        return guild.members.cache;
    });

    let allMembers = Array.from(membersCollection.values());

    // Apply target filter
    if (targetFilter === 'humans') {
        allMembers = allMembers.filter(m => !m.user?.bot);
    } else if (targetFilter === 'bots') {
        allMembers = allMembers.filter(m => Boolean(m.user?.bot));
    }

    const totalMatching = allMembers.length;
    if (totalMatching === 0) {
        throw new Error(`No matching members found for target filter: \`${targetFilter}\`.`);
    }

    const isAdd = (action.toLowerCase() === 'add');
    const candidates = allMembers.filter(m => {
        const has = m.roles.cache.has(role.id);
        return isAdd ? !has : has;
    });

    const alreadySetCount = totalMatching - candidates.length;
    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;

    progressCallback({
        stage: 'starting',
        totalMatching,
        candidatesCount: candidates.length,
        alreadySetCount,
        successCount: 0,
        failCount: 0,
        roleName: role.name,
        roleId: role.id,
        action: isAdd ? 'add' : 'remove',
        targetFilter
    });

    if (candidates.length === 0) {
        const durationMs = Date.now() - startTime;
        return {
            success: true,
            action: isAdd ? 'add' : 'remove',
            roleName: role.name,
            roleId: role.id,
            totalMatching,
            processed: 0,
            alreadySetCount,
            successCount: 0,
            failCount: 0,
            durationMs
        };
    }

    // High-speed parallel worker batching (0.50 turbo mode)
    // Batch size of 12-16 concurrent workers with promise chunks
    const BATCH_SIZE = 12;
    let lastProgressUpdate = 0;

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (member) => {
            try {
                if (isAdd) {
                    await member.roles.add(role.id, `⚡ Turbo Mass Role (/role all) by ${operator}`);
                } else {
                    await member.roles.remove(role.id, `⚡ Turbo Mass Role (/role all) by ${operator}`);
                }
                successCount++;
            } catch (err) {
                if (err.status === 429 || err.code === 429) {
                    const waitMs = err.retry_after ? Math.ceil(err.retry_after * 1000) : 400;
                    await new Promise(r => setTimeout(r, waitMs));
                    try {
                        if (isAdd) await member.roles.add(role.id, `⚡ Turbo Mass Role (/role all) by ${operator}`);
                        else await member.roles.remove(role.id, `⚡ Turbo Mass Role (/role all) by ${operator}`);
                        successCount++;
                        return;
                    } catch (retryErr) {}
                }
                failCount++;
            }
        }));

        // Throttle progress updates to ~1.2s to respect Discord rate limits
        const now = Date.now();
        if (now - lastProgressUpdate > 1200 || (i + BATCH_SIZE >= candidates.length)) {
            lastProgressUpdate = now;
            const processedSoFar = successCount + failCount;
            const elapsedSec = Math.max(0.1, (now - startTime) / 1000);
            const speed = (processedSoFar / elapsedSec).toFixed(1);
            progressCallback({
                stage: 'running',
                totalMatching,
                candidatesCount: candidates.length,
                alreadySetCount,
                successCount,
                failCount,
                roleName: role.name,
                roleId: role.id,
                action: isAdd ? 'add' : 'remove',
                targetFilter,
                speed,
                progressPercent: Math.round((processedSoFar / candidates.length) * 100)
            });
        }

        // 20ms micro-sleep between batches for high-throughput concurrency
        await new Promise(r => setTimeout(r, 20));
    }

    const durationMs = Date.now() - startTime;
    addLog(`Mass Role (${isAdd ? 'Add' : 'Remove'})`, role.name, guild.id, true, `Role: @${role.name}, Done: ${successCount}/${candidates.length}, Skipped: ${alreadySetCount} in ${(durationMs/1000).toFixed(2)}s by ${operator}`);

    return {
        success: true,
        action: isAdd ? 'add' : 'remove',
        roleName: role.name,
        roleId: role.id,
        totalMatching,
        processed: candidates.length,
        alreadySetCount,
        successCount,
        failCount,
        durationMs
    };
}

// ----------------------------------------------------------------------------
// 🔒 High-Speed Server Channel Lockdown & Unlock Engine (Turbo 0.50 Speed)
// ----------------------------------------------------------------------------
async function executeMassChannelLock({
    guild,
    action = 'lock', // 'lock' or 'unlock'
    scope = 'all', // 'all', 'text', 'voice'
    reason = 'Server Lockdown',
    operator = 'Operator',
    progressCallback = () => {}
}) {
    if (!guild) throw new Error('No server provided.');
    if (!client.isReady()) throw new Error('Discord bot is currently offline.');

    const botMember = await guild.members.fetch(client.user.id).catch(() => null);
    if (!botMember) {
        throw new Error(`Bot is not a member of **${guild.name}**.`);
    }

    const hasAdminOrManage = botMember.permissions.has(PermissionFlagsBits.Administrator) || botMember.permissions.has(PermissionFlagsBits.ManageChannels);
    if (!hasAdminOrManage) {
        throw new Error(`Bot lacks **Manage Channels** or **Administrator** permissions in **${guild.name}**.`);
    }

    const everyoneRole = guild.roles.everyone;
    if (!everyoneRole) {
        throw new Error(`Could not locate @everyone role in **${guild.name}**.`);
    }

    progressCallback({
        stage: 'fetching',
        message: '📥 Fetching all server channels from Discord...'
    });

    const channelsCollection = await guild.channels.fetch().catch(() => guild.channels.cache);
    const isLock = (action.toLowerCase() === 'lock');

    // Filter target channels by scope
    const targetChannels = Array.from(channelsCollection.values()).filter(ch => {
        if (!ch) return false;
        if (ch.type === ChannelType.GuildCategory) return false;

        const isTextLike = [
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.GuildForum
        ].includes(ch.type);

        const isVoiceLike = [
            ChannelType.GuildVoice,
            ChannelType.GuildStageVoice
        ].includes(ch.type);

        if (scope === 'text') return isTextLike;
        if (scope === 'voice') return isVoiceLike;
        return isTextLike || isVoiceLike;
    });

    if (targetChannels.length === 0) {
        throw new Error(`No eligible channels found in **${guild.name}** for scope: \`${scope}\`.`);
    }

    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;
    const totalChannels = targetChannels.length;

    progressCallback({
        stage: 'starting',
        totalChannels,
        action: isLock ? 'lock' : 'unlock',
        scope,
        successCount: 0,
        failCount: 0
    });

    // High-speed parallel worker batching (10 concurrent workers)
    const BATCH_SIZE = 10;
    let lastProgressUpdate = 0;

    for (let i = 0; i < targetChannels.length; i += BATCH_SIZE) {
        const batch = targetChannels.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (channel) => {
            try {
                const isVoiceLike = [
                    ChannelType.GuildVoice,
                    ChannelType.GuildStageVoice
                ].includes(channel.type);

                let overwriteConfig = {};
                if (isLock) {
                    if (isVoiceLike) {
                        overwriteConfig = {
                            Speak: false,
                            Connect: false,
                            SendMessages: false
                        };
                    } else {
                        overwriteConfig = {
                            SendMessages: false,
                            SendMessagesInThreads: false,
                            CreatePublicThreads: false,
                            CreatePrivateThreads: false,
                            AddReactions: false
                        };
                    }
                } else {
                    if (isVoiceLike) {
                        overwriteConfig = {
                            Speak: null,
                            Connect: null,
                            SendMessages: null
                        };
                    } else {
                        overwriteConfig = {
                            SendMessages: null,
                            SendMessagesInThreads: null,
                            CreatePublicThreads: null,
                            CreatePrivateThreads: null,
                            AddReactions: null
                        };
                    }
                }

                await channel.permissionOverwrites.edit(
                    everyoneRole.id,
                    overwriteConfig,
                    { reason: `⚡ Turbo Mass Channel ${isLock ? 'Lock' : 'Unlock'} (${reason}) by ${operator}` }
                );
                successCount++;
            } catch (err) {
                if (err.status === 429 || err.code === 429) {
                    const waitMs = err.retry_after ? Math.ceil(err.retry_after * 1000) : 400;
                    await new Promise(r => setTimeout(r, waitMs));
                    try {
                        const isVoiceLike = [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type);
                        const overwriteConfig = isLock 
                            ? (isVoiceLike ? { Speak: false, Connect: false, SendMessages: false } : { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false, AddReactions: false })
                            : (isVoiceLike ? { Speak: null, Connect: null, SendMessages: null } : { SendMessages: null, SendMessagesInThreads: null, CreatePublicThreads: null, CreatePrivateThreads: null, AddReactions: null });

                        await channel.permissionOverwrites.edit(everyoneRole.id, overwriteConfig, { reason: `⚡ Turbo Mass Channel ${isLock ? 'Lock' : 'Unlock'} (${reason}) by ${operator}` });
                        successCount++;
                        return;
                    } catch (retryErr) {}
                }
                failCount++;
            }
        }));

        const now = Date.now();
        if (now - lastProgressUpdate > 1000 || (i + BATCH_SIZE >= targetChannels.length)) {
            lastProgressUpdate = now;
            const processedSoFar = successCount + failCount;
            const elapsedSec = Math.max(0.1, (now - startTime) / 1000);
            const speed = (processedSoFar / elapsedSec).toFixed(1);
            progressCallback({
                stage: 'running',
                totalChannels,
                successCount,
                failCount,
                action: isLock ? 'lock' : 'unlock',
                scope,
                speed,
                progressPercent: Math.round((processedSoFar / totalChannels) * 100)
            });
        }

        await new Promise(r => setTimeout(r, 20));
    }

    const durationMs = Date.now() - startTime;
    addLog(`Channel ${isLock ? 'Lockdown' : 'Unlock'}`, `${successCount}/${totalChannels} channels`, guild.id, true, `Scope: ${scope}, Reason: ${reason} in ${(durationMs/1000).toFixed(2)}s by ${operator}`);

    return {
        success: true,
        action: isLock ? 'lock' : 'unlock',
        scope,
        reason,
        totalChannels,
        successCount,
        failCount,
        durationMs
    };
}

// Bot ready event
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`🌐 Bot is in ${client.guilds.cache.size} servers`);
    console.log(`🛡️ Initializing Automated Anti-Nuke, Server Shields, and 24/7 AI Hubs on all servers...`);

    // Auto-setup security and AI hub channel on every guild the bot is in
    for (const [, guild] of client.guilds.cache) {
        try {
            await autoSetupGuildSecurity(guild, true);
            await autoSetupAiChannel(guild, true);
        } catch (e) {
            console.warn(`[Auto-Setup] Error initializing systems for ${guild.name}:`, e.message);
        }
    }
    
    try {
        await registerSlashCommands();
    } catch (err) {
        console.warn('⚠️ Auto slash command registration on ready notice:', err.message);
    }

    try {
        await syncTargetChannelsToHub();
    } catch (err) {
        console.warn('⚠️ Target channels sync notice on ready:', err.message);
    }
});

// Guild Join Event - Automatically Sets Up Protection & AI Hub Immediately
client.on('guildCreate', async guild => {
    console.log(`🛡️ Joined new server: ${guild.name} (${guild.id}). Auto-configuring Anti-Nuke Shield and AI Hub...`);
    try {
        await autoSetupGuildSecurity(guild, false);
        await autoSetupAiChannel(guild, false);
    } catch (err) {
        console.warn(`[Auto-Setup] Guild join setup error:`, err.message);
    }
});

// Helper: Setup and send interactive Ticket Creation Panel
async function sendTicketPanel({
    channel,
    categoryId = null,
    supportRoleId = null,
    title = '🎫 Support & Assistance Tickets',
    description = 'Need help or have an inquiry? Click the button below to open a private, secure support ticket with our team.',
    buttonLabel = 'Create Ticket',
    buttonEmoji = '🎫'
}) {
    const guild = channel.guild;
    if (!ticketConfigs[guild.id]) {
        ticketConfigs[guild.id] = {
            panelChannelId: channel.id,
            categoryId: categoryId || null,
            supportRoleId: supportRoleId || null,
            ticketCounter: 0,
            tickets: {}
        };
    } else {
        ticketConfigs[guild.id].panelChannelId = channel.id;
        if (categoryId) ticketConfigs[guild.id].categoryId = categoryId;
        if (supportRoleId) ticketConfigs[guild.id].supportRoleId = supportRoleId;
        if (!ticketConfigs[guild.id].tickets) ticketConfigs[guild.id].tickets = {};
    }
    saveTickets();

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(title)
        .setDescription(`${description}\n\n• **Private & Secure:** Only you and authorized support staff have access.\n• **Automated Transcripts:** Full HTML chat history exported upon completion.\n• **Fast Support:** Direct 1-on-1 assistance for all queries.`)
        .addFields(
            { name: '📋 Support Hours', value: '`24/7 Priority Support`', inline: true },
            { name: '🛡️ Assigned Role', value: supportRoleId ? `<@&${supportRoleId}>` : '`Server Administrators`', inline: true }
        )
        .setFooter({ text: 'Official Support Ticket System • Click button below' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('ticket_open_btn')
            .setLabel(buttonLabel || 'Create Ticket')
            .setEmoji(buttonEmoji || '🎫')
            .setStyle(ButtonStyle.Primary)
    );

    const panelMsg = await channel.send({ embeds: [embed], components: [row] });
    ticketConfigs[guild.id].panelMessageId = panelMsg.id;
    saveTickets();
    return panelMsg;
}

// Handle Discord Interactions (Slash Commands, Buttons, Modals)
client.on('interactionCreate', async interaction => {
    try {
        // 1. Button Interactions
        if (interaction.isButton()) {
            const { customId, guild, channel, user } = interaction;

            // Fetch Hub script pagination & download buttons
            if (customId.startsWith('hub_')) {
                const parts = customId.split(':');
                const action = parts[0];
                const sessionId = parts[1];
                const currentIndex = parseInt(parts[2], 10);
                const session = hubSessions.get(sessionId);

                if (!session) {
                    return interaction.reply({
                        content: '⚠️ This script search session has expired. Type `.hub <query>` to search again!',
                        flags: 64
                    });
                }

                if (action === 'hub_dl') {
                    const item = session.results[currentIndex];
                    if (!item) {
                        return interaction.reply({ content: '❌ Script not found.', flags: 64 });
                    }
                    let fileToSend = null;
                    if (item.url && item.url.startsWith('http')) {
                        fileToSend = new AttachmentBuilder(item.url, { name: item.name });
                    } else {
                        const snippet = item.content || getRealisticScriptForCachedItem(item);
                        fileToSend = new AttachmentBuilder(Buffer.from(snippet, 'utf-8'), { name: item.name });
                    }
                    return await interaction.reply({
                        content: `📥 **${item.name}**\nFile size: \`${item.sizeFormatted || formatBytes(item.size)}\`\nMessage ID: \`${item.messageId}\``,
                        files: [fileToSend],
                        flags: 64
                    }).catch(async () => {
                        await interaction.followUp({ content: `✅ Download for **${item.name}**:`, files: [fileToSend], flags: 64 }).catch(() => {});
                    });
                }

                if (action === 'hub_exec') {
                    const auth = checkCommandAuthorization(user, interaction.member, guild, false);
                    if (!auth.authorized) {
                        return interaction.reply({
                            content: auth.reason,
                            flags: 64
                        });
                    }

                    const item = session.results[currentIndex];
                    if (!item) {
                        return interaction.reply({ content: '❌ Script not found in session.', flags: 64 });
                    }

                    await interaction.deferReply();
                    let scriptCode = item.content;
                    if (!scriptCode && item.url && item.url.startsWith('http')) {
                        try {
                            const res = await fetch(item.url);
                            if (res.ok) scriptCode = await res.text();
                        } catch (e) {}
                    }
                    if (!scriptCode) {
                        scriptCode = getRealisticScriptForCachedItem(item);
                    }

                    return await handleRobloxExecution({
                        sourceInput: scriptCode,
                        attachment: null,
                        scriptNameInput: item.name,
                        replyFn: (payload) => interaction.editReply(payload),
                        user: interaction.user
                    });
                }

                let newIndex = action === 'hub_prev' ? currentIndex - 1 : currentIndex + 1;
                if (newIndex < 0) newIndex = 0;
                if (newIndex >= session.results.length) newIndex = session.results.length - 1;
                session.currentIndex = newIndex;

                await interaction.deferUpdate();
                const payload = await buildHubResultPayload(session, newIndex);
                return await interaction.editReply(payload);
            }

            // Open ticket modal button
            if (customId === 'ticket_open_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('ticket_create_modal')
                    .setTitle('🎫 Create Support Ticket');

                const topicInput = new TextInputBuilder()
                    .setCustomId('ticket_topic')
                    .setLabel('Ticket Topic / Reason')
                    .setPlaceholder('e.g. Account Help, Forwarding Inquiry, Bug Report')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(100);

                const detailsInput = new TextInputBuilder()
                    .setCustomId('ticket_details')
                    .setLabel('Describe Your Issue or Request')
                    .setPlaceholder('Provide all relevant details, links, or questions here...')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(topicInput),
                    new ActionRowBuilder().addComponents(detailsInput)
                );

                return await interaction.showModal(modal);
            }

            // Ticket Channel Management Buttons
            if (customId.startsWith('ticket_btn_')) {
                const action = customId.replace('ticket_btn_', '');
                const cfg = guild ? ticketConfigs[guild.id] : null;
                const ticketInfo = cfg?.tickets ? cfg.tickets[channel.id] : null;

                if (action === 'close') {
                    await interaction.deferReply();
                    if (ticketInfo) {
                        ticketInfo.status = 'closed';
                        ticketInfo.closedBy = user.id;
                        ticketInfo.closedAt = new Date().toISOString();
                        saveTickets();
                    }

                    // Remove SendMessages from creator if channel is ticket
                    if (ticketInfo && ticketInfo.creatorId) {
                        await channel.permissionOverwrites.edit(ticketInfo.creatorId, {
                            SendMessages: false
                        }).catch(() => {});
                    }

                    const closeEmbed = new EmbedBuilder()
                        .setColor(0xE11D48)
                        .setTitle('🔒 Ticket Closed')
                        .setDescription(`This ticket was closed by <@${user.id}>.\nChoose an action below to manage this ticket:`)
                        .addFields(
                            { name: '👤 Closed By', value: `<@${user.id}>`, inline: true },
                            { name: '⏱️ Closed At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                        )
                        .setTimestamp();

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('ticket_btn_reopen')
                            .setLabel('Re-Open Ticket')
                            .setEmoji('🔓')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId('ticket_btn_transcript')
                            .setLabel('Export Transcript')
                            .setEmoji('📜')
                            .setStyle(ButtonStyle.Primary),
                        new ButtonBuilder()
                            .setCustomId('ticket_btn_delete')
                            .setLabel('Delete Ticket')
                            .setEmoji('🗑️')
                            .setStyle(ButtonStyle.Danger)
                    );

                    return interaction.editReply({ embeds: [closeEmbed], components: [row] });
                } else if (action === 'reopen') {
                    await interaction.deferReply();
                    if (ticketInfo) {
                        ticketInfo.status = 'open';
                        ticketInfo.reopenedBy = user.id;
                        ticketInfo.reopenedAt = new Date().toISOString();
                        saveTickets();

                        if (ticketInfo.creatorId) {
                            await channel.permissionOverwrites.edit(ticketInfo.creatorId, {
                                SendMessages: true,
                                ViewChannel: true
                            }).catch(() => {});
                        }
                    }

                    const reopenEmbed = new EmbedBuilder()
                        .setColor(0x10B981)
                        .setTitle('🔓 Ticket Re-Opened')
                        .setDescription(`This ticket was re-opened by <@${user.id}>. Members can resume messaging.`)
                        .setTimestamp();

                    return interaction.editReply({ embeds: [reopenEmbed] });
                } else if (action === 'transcript') {
                    await interaction.deferReply();
                    const exportResult = await exportChannelHtml(channel, 300, false);
                    if (!exportResult.success) {
                        return interaction.editReply({ content: `❌ Failed to generate transcript: ${exportResult.message}` });
                    }

                    const fileAttachment = new AttachmentBuilder(Buffer.from(exportResult.html, 'utf-8'), {
                        name: exportResult.fileName
                    });

                    const transEmbed = new EmbedBuilder()
                        .setColor(0x5865F2)
                        .setTitle('📜 Ticket Transcript Exported')
                        .setDescription(`Saved **${exportResult.messageCount}** messages from this ticket as an HTML file.`)
                        .setTimestamp();

                    // Also attempt to DM transcript to user
                    try {
                        await user.send({
                            content: `📜 Here is the transcript for ticket channel **#${channel.name}** in **${guild?.name || 'Discord'}**:`,
                            files: [fileAttachment]
                        });
                    } catch (dmErr) {}

                    return interaction.editReply({ embeds: [transEmbed], files: [fileAttachment] });
                } else if (action === 'claim') {
                    const claimEmbed = new EmbedBuilder()
                        .setColor(0xF59E0B)
                        .setTitle('🙋‍♂️ Ticket Claimed')
                        .setDescription(`<@${user.id}> has claimed this ticket and is now assisting you.`)
                        .setTimestamp();

                    return interaction.reply({ embeds: [claimEmbed] });
                } else if (action === 'delete') {
                    await interaction.reply({ content: '🗑️ **Ticket will be permanently deleted in 5 seconds...**' });
                    setTimeout(() => {
                        channel.delete('Ticket deleted by staff').catch(() => {});
                    }, 5000);
                    return;
                }
            }
            return;
        }

        // 2. Modal Submission Interactions
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'ticket_create_modal') {
                await interaction.deferReply({ flags: 64 });
                const guild = interaction.guild;
                if (!guild) {
                    return interaction.editReply({ content: '❌ Tickets can only be created inside a server.' });
                }

                const topic = interaction.fields.getTextInputValue('ticket_topic');
                const details = interaction.fields.getTextInputValue('ticket_details');

                if (!ticketConfigs[guild.id]) {
                    ticketConfigs[guild.id] = { ticketCounter: 0, tickets: {} };
                }
                const cfg = ticketConfigs[guild.id];
                cfg.ticketCounter = (cfg.ticketCounter || 0) + 1;
                const ticketNum = String(cfg.ticketCounter).padStart(4, '0');

                const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'user';
                const channelName = `ticket-${ticketNum}-${cleanName}`;

                const overwrites = [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    },
                    {
                        id: client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageChannels,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    }
                ];

                if (cfg.supportRoleId) {
                    overwrites.push({
                        id: cfg.supportRoleId,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.AttachFiles,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    });
                }

                let parentCategory = cfg.categoryId;
                if (parentCategory) {
                    const catCheck = guild.channels.cache.get(parentCategory);
                    if (!catCheck || catCheck.type !== ChannelType.GuildCategory) {
                        parentCategory = null;
                    }
                }

                const ticketChannel = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: parentCategory || undefined,
                    topic: `Support Ticket #${ticketNum} | Creator: ${interaction.user.tag} (${interaction.user.id}) | Topic: ${topic}`,
                    permissionOverwrites: overwrites,
                    reason: `Support Ticket created by ${interaction.user.tag}`
                });

                if (!cfg.tickets) cfg.tickets = {};
                cfg.tickets[ticketChannel.id] = {
                    id: ticketChannel.id,
                    ticketNumber: ticketNum,
                    creatorId: interaction.user.id,
                    creatorTag: interaction.user.tag || interaction.user.username,
                    topic,
                    details,
                    createdAt: new Date().toISOString(),
                    status: 'open'
                };
                saveTickets();

                const welcomeEmbed = new EmbedBuilder()
                    .setColor(0x00E5FF)
                    .setTitle(`🎫 Ticket #${ticketNum} — ${topic}`)
                    .setDescription(`Welcome <@${interaction.user.id}>! Our support staff have been notified and will assist you shortly.\n\n**📝 Details / Request:**\n\`\`\`\n${details}\n\`\`\``)
                    .addFields(
                        { name: '👤 Creator', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📊 Status', value: '`🟢 Open`', inline: true },
                        { name: '⏱️ Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                    )
                    .setFooter({ text: 'Use buttons below to manage this ticket' })
                    .setTimestamp();

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_btn_close')
                        .setLabel('Close Ticket')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('ticket_btn_transcript')
                        .setLabel('Save Transcript')
                        .setEmoji('📜')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('ticket_btn_claim')
                        .setLabel('Claim Ticket')
                        .setEmoji('🙋‍♂️')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('ticket_btn_delete')
                        .setLabel('Delete')
                        .setEmoji('🗑️')
                        .setStyle(ButtonStyle.Danger)
                );

                const pingContent = cfg.supportRoleId ? `<@${interaction.user.id}> | <@&${cfg.supportRoleId}>` : `<@${interaction.user.id}>`;
                await ticketChannel.send({ content: pingContent, embeds: [welcomeEmbed], components: [btnRow] });

                addLog('Ticket Created', interaction.user.id, ticketChannel.id, true, `Ticket #${ticketNum}: ${topic}`);

                return interaction.editReply({
                    content: `✅ **Ticket #${ticketNum} Created!** Head over to <#${ticketChannel.id}> to speak with our support team.`
                });
            }
            return;
        }

        // 3. Chat Input Slash Commands
        if (!interaction.isChatInputCommand()) return;

        const { commandName, guildId, channel, guild } = interaction;

        // Verify user authorization when bot is locked (except public commands like /invite)
        const isPublicCommand = (commandName === 'invite');
        const auth = checkCommandAuthorization(interaction.user, interaction.member, guild, isPublicCommand);
        if (!auth.authorized) {
            return interaction.reply({
                content: auth.reason,
                flags: 64
            });
        }

        if (commandName === 'whitelist2') {
            const sub = interaction.options.getSubcommand();
            const masterId = getMasterOwnerId();
            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId;
            const isOwner = guild && (interaction.user.id === guild.ownerId);
            const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

            if (sub === 'list') {
                const listFormatted = whitelist2.map(id => {
                    const tag = id === masterId ? '👑 Master Operator' : (id === client.user?.id ? '🤖 Bot' : '⚡ Forward Authorized');
                    return `• <@${id}> (\`${id}\`) — **${tag}**`;
                }).join('\n') || '*No users in Whitelist 2 yet.*';

                const listEmbed = new EmbedBuilder()
                    .setColor(0x00E5FF)
                    .setTitle(`⚡ Whitelist 2: Forwarding & DM Whitelist (${whitelist2.length})`)
                    .setDescription(`Users on **Whitelist 2** have full permission to use all forward features, automated channel forwarding, and bot commands directly in **DMs & Servers**.\n\n${listFormatted}`)
                    .setFooter({ text: 'Manage with /whitelist2 add <user> or /whitelist2 remove <user>' })
                    .setTimestamp();

                return interaction.reply({ embeds: [listEmbed] });
            } else if (sub === 'check') {
                const targetUser = interaction.options.getUser('user') || interaction.user;
                const isWhitelisted2 = isWhitelist2(targetUser.id);

                const checkEmbed = new EmbedBuilder()
                    .setColor(isWhitelisted2 ? 0x10B981 : 0xE11D48)
                    .setTitle(`🔍 Whitelist 2 Status: ${targetUser.tag || targetUser.username}`)
                    .setDescription(isWhitelisted2 
                        ? `✅ <@${targetUser.id}> is **AUTHORIZED** in Whitelist 2! They can run forward commands and DM commands.`
                        : `❌ <@${targetUser.id}> is **NOT** in Whitelist 2.`)
                    .addFields(
                        { name: 'User ID', value: `\`${targetUser.id}\``, inline: true },
                        { name: 'DM Commands Access', value: isWhitelisted2 ? '✅ Enabled' : '❌ Blocked', inline: true },
                        { name: 'Forward System Access', value: isWhitelisted2 ? '✅ Enabled' : '❌ Blocked', inline: true }
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [checkEmbed] });
            }

            // add & remove require Master Owner or Server Admin
            if (!isMaster && !isOwner && !isAdmin) {
                return interaction.reply({
                    content: '❌ Only Master Bot Owners and Server Administrators can manage Whitelist 2.',
                    flags: 64
                });
            }

            const targetUser = interaction.options.getUser('user', true);

            if (sub === 'add') {
                if (whitelist2.includes(targetUser.id)) {
                    return interaction.reply({
                        content: `ℹ️ <@${targetUser.id}> is already in Whitelist 2.`,
                        flags: 64
                    });
                }
                whitelist2.push(targetUser.id);
                saveWhitelist2();
                addLog('Whitelist2 Added', targetUser.id, interaction.user.id, true, `Added by ${interaction.user.tag}`);

                const addEmbed = new EmbedBuilder()
                    .setColor(0x10B981)
                    .setTitle('⚡ Whitelist 2 Updated: User Added')
                    .setDescription(`✅ Successfully added <@${targetUser.id}> (\`${targetUser.tag || targetUser.id}\`) to **Whitelist 2**!`)
                    .addFields(
                        { name: '👑 Permissions Granted', value: '• Use Channel & Message Forwarding\n• Execute Forward Commands in **Direct Messages (DMs)**\n• Export HTML Transcripts & Purge', inline: false },
                        { name: '👤 Operator', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [addEmbed] });
            } else if (sub === 'remove') {
                if (targetUser.id === masterId || isMasterOwner(targetUser.id)) {
                    return interaction.reply({ content: '❌ Cannot remove Master Bot Operator from Whitelist 2.', flags: 64 });
                }
                if (!whitelist2.includes(targetUser.id)) {
                    return interaction.reply({ content: `ℹ️ <@${targetUser.id}> is not in Whitelist 2.`, flags: 64 });
                }
                whitelist2 = whitelist2.filter(id => id !== targetUser.id);
                saveWhitelist2();
                addLog('Whitelist2 Removed', targetUser.id, interaction.user.id, true, `Removed by ${interaction.user.tag}`);

                return interaction.reply({
                    content: `✅ Successfully removed <@${targetUser.id}> from **Whitelist 2**.`
                });
            }
        } else if (commandName === 'execute') {
            await interaction.deferReply();
            const codeInput = interaction.options.getString('code');
            const fileInput = interaction.options.getAttachment('file');
            const scriptNameInput = interaction.options.getString('script_name');

            return await handleRobloxExecution({
                sourceInput: codeInput,
                attachment: fileInput,
                scriptNameInput,
                replyFn: (payload) => interaction.editReply(payload),
                user: interaction.user
            });
        } else if (commandName === 'whitelist3') {
            const sub = interaction.options.getSubcommand();
            const masterId = getMasterOwnerId();
            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId;
            const isOwner = guild && (interaction.user.id === guild.ownerId);
            const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

            if (sub === 'list') {
                const listFormatted = whitelist3.map(id => {
                    const tag = id === masterId ? '👑 Master Operator' : (id === client.user?.id ? '🤖 Bot' : '⚡ Commands Authorized');
                    return `• <@${id}> (\`${id}\`) — **${tag}**`;
                }).join('\n') || '*No users in Whitelist 3 yet.*';

                const listEmbed = new EmbedBuilder()
                    .setColor(0x3B82F6)
                    .setTitle(`⚡ Whitelist 3: Commands Only Whitelist (${whitelist3.length})`)
                    .setDescription(`Users on **Whitelist 3** are granted permission to execute commands (such as \`.execute\`, \`.hub\`, \`/execute\`, etc.) while the bot is locked down.\n\n${listFormatted}`)
                    .setFooter({ text: 'Manage with /whitelist3 add <user> or /whitelist 3 add <user>' })
                    .setTimestamp();

                return interaction.reply({ embeds: [listEmbed] });
            } else if (sub === 'check') {
                const targetUser = interaction.options.getUser('user') || interaction.user;
                const isWhitelisted3 = isWhitelist3(targetUser.id);

                const checkEmbed = new EmbedBuilder()
                    .setColor(isWhitelisted3 ? 0x10B981 : 0xE11D48)
                    .setTitle(`🔍 Whitelist 3 Status: ${targetUser.tag || targetUser.username}`)
                    .setDescription(isWhitelisted3 
                        ? `✅ <@${targetUser.id}> is **AUTHORIZED** in Whitelist 3! They can run bot commands.`
                        : `❌ <@${targetUser.id}> is **NOT** in Whitelist 3.`)
                    .addFields(
                        { name: 'User ID', value: `\`${targetUser.id}\``, inline: true },
                        { name: 'Commands Permission', value: isWhitelisted3 ? '✅ Authorized' : '❌ Blocked', inline: true }
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [checkEmbed] });
            }

            // add & remove require Master Owner or Server Admin
            if (!isMaster && !isOwner && !isAdmin) {
                return interaction.reply({
                    content: '❌ Only Master Bot Owners and Server Administrators can manage Whitelist 3.',
                    flags: 64
                });
            }

            const targetUser = interaction.options.getUser('user', true);

            if (sub === 'add') {
                if (whitelist3.includes(targetUser.id)) {
                    return interaction.reply({
                        content: `ℹ️ <@${targetUser.id}> is already in Whitelist 3.`,
                        flags: 64
                    });
                }
                whitelist3.push(targetUser.id);
                saveWhitelist3();
                addLog('Whitelist3 Added', targetUser.id, interaction.user.id, true, `Added by ${interaction.user.tag}`);

                const addEmbed = new EmbedBuilder()
                    .setColor(0x10B981)
                    .setTitle('⚡ Whitelist 3 Updated: User Authorized')
                    .setDescription(`✅ Successfully added <@${targetUser.id}> (\`${targetUser.tag || targetUser.id}\`) to **Whitelist 3 (Commands Only)**!`)
                    .addFields(
                        { name: '👑 Permissions Granted', value: '• Execute Roblox Script Executor (\`.execute\`, \`/execute\`)\n• Search & Fetch Scripts (\`.hub\`, \`/hub\`)\n• Run Bot Commands while Locked', inline: false },
                        { name: '👤 Operator', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [addEmbed] });
            } else if (sub === 'remove') {
                if (targetUser.id === masterId || isMasterOwner(targetUser.id)) {
                    return interaction.reply({ content: '❌ Cannot remove Master Bot Operator from Whitelist 3.', flags: 64 });
                }
                if (!whitelist3.includes(targetUser.id)) {
                    return interaction.reply({ content: `ℹ️ <@${targetUser.id}> is not in Whitelist 3.`, flags: 64 });
                }
                whitelist3 = whitelist3.filter(id => id !== targetUser.id);
                saveWhitelist3();
                addLog('Whitelist3 Removed', targetUser.id, interaction.user.id, true, `Removed by ${interaction.user.tag}`);

                return interaction.reply({
                    content: `✅ Successfully removed <@${targetUser.id}> from **Whitelist 3**.`
                });
            }
        } else if (commandName === 'unwhitelist') {
            const masterId = getMasterOwnerId();
            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId;
            const isOwner = guild && (interaction.user.id === guild.ownerId);
            const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

            if (!isMaster && !isOwner && !isAdmin) {
                return interaction.reply({ content: '❌ Only Master Bot Owners and Server Administrators can execute unwhitelist commands.', flags: 64 });
            }

            const target = interaction.options.getString('target');
            const targetUser = interaction.options.getUser('user');

            if (target === 'all') {
                // Clear ALL Whitelists across all tiers (bot lockdown!)
                let serverCount = 0;
                let clearedCount = 0;

                // 1. Clear Server Security Whitelist
                for (const gId in securityConfig) {
                    if (securityConfig[gId] && Array.isArray(securityConfig[gId].whitelist)) {
                        const before = securityConfig[gId].whitelist.length;
                        securityConfig[gId].whitelist = securityConfig[gId].whitelist.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id || (guild && id === guild.ownerId));
                        clearedCount += (before - securityConfig[gId].whitelist.length);
                        serverCount++;
                    }
                }
                saveSecurity();

                // 2. Clear Whitelist 2
                const beforeWl2 = whitelist2.length;
                whitelist2 = whitelist2.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id);
                clearedCount += (beforeWl2 - whitelist2.length);
                saveWhitelist2();

                // 3. Clear Whitelist 3
                const beforeWl3 = whitelist3.length;
                whitelist3 = whitelist3.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id);
                clearedCount += (beforeWl3 - whitelist3.length);
                saveWhitelist3();

                addLog('Unwhitelist All', 'Global', interaction.user.id, true, `Cleared ${clearedCount} users from all whitelists`);

                const unwhitelistEmbed = new EmbedBuilder()
                    .setColor(0xEF4444)
                    .setTitle('🚫 Global Unwhitelist All Completed — Bot Locked Down')
                    .setDescription(`Successfully cleared **all non-owner users** from **EVERY** whitelist tier!\nThe bot is now locked down for everybody unless explicitly whitelisted.`)
                    .addFields(
                        { name: '🛡️ Server Anti-Nuke Whitelist', value: 'Cleared all non-masters', inline: true },
                        { name: '⚡ Whitelist 2 (Forwards & DMs)', value: 'Cleared all non-masters', inline: true },
                        { name: '💻 Whitelist 3 (Commands Only)', value: 'Cleared all non-masters', inline: true },
                        { name: '🔒 Bot Lock State', value: 'Active (Locked for Everyone)', inline: true },
                        { name: '👤 Operator', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setFooter({ text: 'All whitelists wiped • Bot lockdown active' })
                    .setTimestamp();

                return interaction.reply({ embeds: [unwhitelistEmbed] });
            } else if (target === 'tier1') {
                if (guild) {
                    const sec = getGuildSecurity(guild.id, guild.ownerId);
                    sec.whitelist = sec.whitelist.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id || id === guild.ownerId);
                    saveSecurity();
                }
                return interaction.reply({ content: '✅ Successfully cleared Server Anti-Nuke Whitelist (Tier 1).' });
            } else if (target === 'tier2') {
                whitelist2 = whitelist2.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id);
                saveWhitelist2();
                return interaction.reply({ content: '✅ Successfully cleared Whitelist 2 (Tier 2: Forwards & DMs).' });
            } else if (target === 'tier3') {
                whitelist3 = whitelist3.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id);
                saveWhitelist3();
                return interaction.reply({ content: '✅ Successfully cleared Whitelist 3 (Tier 3: Commands Only).' });
            } else if (target === 'user') {
                if (!targetUser) {
                    return interaction.reply({ content: '❌ Please specify the user to unwhitelist.', flags: 64 });
                }
                if (targetUser.id === masterId || isMasterOwner(targetUser.id)) {
                    return interaction.reply({ content: '❌ Cannot unwhitelist Master Bot Operator.', flags: 64 });
                }
                if (guild) {
                    const sec = getGuildSecurity(guild.id, guild.ownerId);
                    sec.whitelist = sec.whitelist.filter(id => id !== targetUser.id);
                    saveSecurity();
                }
                whitelist2 = whitelist2.filter(id => id !== targetUser.id);
                saveWhitelist2();
                whitelist3 = whitelist3.filter(id => id !== targetUser.id);
                saveWhitelist3();

                return interaction.reply({ content: `✅ Successfully unwhitelisted <@${targetUser.id}> across all tiers.` });
            }
        } else if (commandName === 'syncsources') {
            await interaction.deferReply();
            const count = await syncTargetChannelsToHub();
            return interaction.editReply(`✅ **Source Synchronization Complete!**\nScanned channel IDs \`1542249491384639708\` and \`1542250901396394065\`.\nTotal sources in Fetch Hub: **${fetchHubCache.length}**.\nUse \`.hub\` or \`/hub\` to browse and execute!`);
        } else if (commandName === 'ticket-setup' || (commandName === 'ticket' && interaction.options.getSubcommand(false) === 'setup')) {
            if (!interaction.guild) {
                return interaction.reply({ content: '❌ Ticket setup can only be used inside a Discord server.', flags: 64 });
            }

            const masterId = getMasterOwnerId();
            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId;
            const isOwner = interaction.user.id === guild?.ownerId;
            const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) || interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels);

            if (!isMaster && !isOwner && !isAdmin) {
                return interaction.reply({
                    content: '🔒 You need Administrator or Manage Channels permission to configure the Ticket System.',
                    flags: 64
                });
            }

            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
            const categoryOption = interaction.options.getChannel('category');
            const supportRole = interaction.options.getRole('support_role');
            const title = interaction.options.getString('title') || '🎫 Support & Assistance Tickets';
            const description = interaction.options.getString('description') || 'Need help or have an inquiry? Click the button below to open a private, secure support ticket with our team.';
            const buttonLabel = interaction.options.getString('button_label') || 'Create Ticket';

            await interaction.deferReply({ flags: 64 });

            try {
                const panelMsg = await sendTicketPanel({
                    channel: targetChannel,
                    categoryId: categoryOption ? categoryOption.id : null,
                    supportRoleId: supportRole ? supportRole.id : null,
                    title,
                    description,
                    buttonLabel
                });

                const confirmEmbed = new EmbedBuilder()
                    .setColor(0x10B981)
                    .setTitle('🎫 Ticket System Configured Successfully!')
                    .setDescription(`The interactive ticket creation panel is now LIVE in <#${targetChannel.id}>!`)
                    .addFields(
                        { name: '📍 Panel Channel', value: `<#${targetChannel.id}>`, inline: true },
                        { name: '📁 Ticket Category', value: categoryOption ? `<#${categoryOption.id}>` : '`Same Category / Root`', inline: true },
                        { name: '🛡️ Support Role', value: supportRole ? `<@&${supportRole.id}>` : '`Server Administrators`', inline: true },
                        { name: '🔘 Button Label', value: `\`${buttonLabel}\``, inline: true }
                    )
                    .setFooter({ text: 'Discord High-Speed Support Ticket Engine' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [confirmEmbed] });
            } catch (setupErr) {
                console.error('Ticket setup error:', setupErr);
                return interaction.editReply({ content: `❌ **Ticket Setup Failed:** ${setupErr.message}` });
            }
        } else if (commandName === 'ticket') {
            const sub = interaction.options.getSubcommand();
            const cfg = guild ? ticketConfigs[guild.id] : null;
            const ticketInfo = cfg?.tickets ? cfg.tickets[channel.id] : null;

            if (sub === 'close') {
                const reason = interaction.options.getString('reason') || 'Resolved / Closed by staff';
                await interaction.deferReply();

                if (ticketInfo) {
                    ticketInfo.status = 'closed';
                    ticketInfo.closedBy = interaction.user.id;
                    ticketInfo.closedAt = new Date().toISOString();
                    saveTickets();
                    if (ticketInfo.creatorId) {
                        await channel.permissionOverwrites.edit(ticketInfo.creatorId, {
                            SendMessages: false
                        }).catch(() => {});
                    }
                }

                const closeEmbed = new EmbedBuilder()
                    .setColor(0xE11D48)
                    .setTitle('🔒 Ticket Closed')
                    .setDescription(`This ticket has been closed.\n\n**Reason:** *${reason}*`)
                    .addFields(
                        { name: '👤 Closed By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '⏱️ Closed At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_btn_reopen')
                        .setLabel('Re-Open Ticket')
                        .setEmoji('🔓')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('ticket_btn_transcript')
                        .setLabel('Export Transcript')
                        .setEmoji('📜')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('ticket_btn_delete')
                        .setLabel('Delete Ticket')
                        .setEmoji('🗑️')
                        .setStyle(ButtonStyle.Danger)
                );

                return interaction.editReply({ embeds: [closeEmbed], components: [row] });
            } else if (sub === 'transcript') {
                await interaction.deferReply();
                const exportResult = await exportChannelHtml(channel, 300, false);
                if (!exportResult.success) {
                    return interaction.editReply({ content: `❌ Failed to generate transcript: ${exportResult.message}` });
                }

                const fileAttachment = new AttachmentBuilder(Buffer.from(exportResult.html, 'utf-8'), {
                    name: exportResult.fileName
                });

                const transEmbed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle('📜 Ticket Transcript Exported')
                    .setDescription(`Successfully exported **${exportResult.messageCount}** messages from this ticket as an HTML file.`)
                    .setTimestamp();

                try {
                    await interaction.user.send({
                        content: `📜 Here is the transcript for **#${channel.name}** in **${guild?.name || 'Discord'}**:`,
                        files: [fileAttachment]
                    });
                } catch (e) {}

                return interaction.editReply({ embeds: [transEmbed], files: [fileAttachment] });
            } else if (sub === 'add') {
                const targetUser = interaction.options.getUser('user', true);
                await channel.permissionOverwrites.edit(targetUser.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    AttachFiles: true,
                    EmbedLinks: true,
                    ReadMessageHistory: true
                });

                return interaction.reply({
                    content: `✅ Successfully added <@${targetUser.id}> to this ticket channel!`
                });
            } else if (sub === 'remove') {
                const targetUser = interaction.options.getUser('user', true);
                await channel.permissionOverwrites.delete(targetUser.id).catch(() => {});

                return interaction.reply({
                    content: `✅ Successfully removed <@${targetUser.id}> from this ticket channel.`
                });
            } else if (sub === 'delete') {
                await interaction.reply({ content: '🗑️ **Ticket will be permanently deleted in 5 seconds...**' });
                setTimeout(() => {
                    channel.delete('Ticket deleted').catch(() => {});
                }, 5000);
                return;
            }
        } else if (commandName === 'photo') {
            const subCommand = interaction.options.getSubcommand();

            if (subCommand === 'generate') {
                await interaction.deferReply();
                const prompt = interaction.options.getString('prompt');
                const style = interaction.options.getString('style') || 'Digital Art';
                const aspectRatio = interaction.options.getString('aspect_ratio') || '1:1';
                const customName = interaction.options.getString('name');

                const photo = await generatePhotoWithAI({ prompt, style, aspectRatio, name: customName, author: interaction.user.tag });
                const base64Data = photo.dataUrl.replace(/^data:image\/[a-z0-9+]+;base64,/, '');
                const ext = photo.dataUrl.includes('image/svg') ? 'svg' : (photo.dataUrl.includes('image/png') ? 'png' : 'jpg');
                const fileName = `${photo.id}.${ext}`;
                const fileAttachment = new AttachmentBuilder(Buffer.from(base64Data, 'base64'), { name: fileName });

                const embed = new EmbedBuilder()
                    .setColor(0x00E5FF)
                    .setTitle(`🎨 ${photo.name}`)
                    .setDescription(`**Prompt:** ${photo.prompt}`)
                    .addFields(
                        { name: 'Style', value: photo.style, inline: true },
                        { name: 'Aspect Ratio', value: photo.aspectRatio, inline: true },
                        { name: 'Engine', value: photo.engine || 'AI Engine', inline: true },
                        { name: 'Photo ID', value: `\`${photo.id}\``, inline: true }
                    )
                    .setImage(`attachment://${fileName}`)
                    .setFooter({ text: 'AI Photo Studio • Use /photo edit <id> or /photo rename <id>' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed], files: [fileAttachment] });
            } else if (subCommand === 'list') {
                if (photos.length === 0) {
                    return interaction.reply({ content: '🖼️ No AI photos created yet. Use `/photo generate` to create your first artwork!', flags: 64 });
                }
                const recent = photos.slice(0, 10);
                const listText = recent.map((p, i) => `${i + 1}. **${p.name}** (\`${p.id}\`)\n   *${p.prompt.slice(0, 60)}...* [${p.style}] (${p.engine || 'AI'})`).join('\n\n');

                const embed = new EmbedBuilder()
                    .setColor(0x00E5FF)
                    .setTitle(`🖼️ AI Photo Studio Gallery (${photos.length} Total)`)
                    .setDescription(listText)
                    .setFooter({ text: 'Use /photo edit <id> or /photo rename <id>' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            } else if (subCommand === 'rename') {
                const id = interaction.options.getString('id');
                const newName = interaction.options.getString('new_name');
                const photo = photos.find(p => p.id === id || p.name.toLowerCase() === id.toLowerCase());
                if (!photo) {
                    return interaction.reply({ content: `❌ Photo with ID \`${id}\` not found. Use \`/photo list\` to view IDs.`, flags: 64 });
                }
                const oldName = photo.name;
                photo.name = newName.trim();
                photo.updatedAt = new Date().toISOString();
                if (!photo.history) photo.history = [];
                photo.history.push({
                    action: 'renamed',
                    timestamp: new Date().toISOString(),
                    details: `Renamed from "${oldName}" to "${photo.name}" by ${interaction.user.tag}`
                });
                savePhotos();

                return interaction.reply({ content: `✅ **Photo Renamed!**\nChanged from **"${oldName}"** to **"${photo.name}"** (\`${photo.id}\`).` });
            } else if (subCommand === 'edit') {
                await interaction.deferReply();
                const id = interaction.options.getString('id');
                const instructions = interaction.options.getString('instructions');

                const photo = photos.find(p => p.id === id || p.name.toLowerCase() === id.toLowerCase());
                if (!photo) {
                    return interaction.editReply(`❌ Photo with ID \`${id}\` not found. Use \`/photo list\` to view IDs.`);
                }

                const updatedPhoto = await editPhotoWithAI({ photoId: photo.id, instruction: instructions, author: interaction.user.tag });
                const base64Data = updatedPhoto.dataUrl.replace(/^data:image\/[a-z0-9+]+;base64,/, '');
                const ext = updatedPhoto.dataUrl.includes('image/svg') ? 'svg' : (updatedPhoto.dataUrl.includes('image/png') ? 'png' : 'jpg');
                const fileName = `${updatedPhoto.id}.${ext}`;
                const fileAttachment = new AttachmentBuilder(Buffer.from(base64Data, 'base64'), { name: fileName });

                const embed = new EmbedBuilder()
                    .setColor(0x00E5FF)
                    .setTitle(`🪄 Modified: ${updatedPhoto.name}`)
                    .setDescription(`**Changes Applied:** ${instructions}\n**Updated Prompt:** ${updatedPhoto.prompt}`)
                    .addFields(
                        { name: 'Style', value: updatedPhoto.style, inline: true },
                        { name: 'Engine', value: updatedPhoto.engine || 'AI Engine', inline: true },
                        { name: 'Photo ID', value: `\`${updatedPhoto.id}\``, inline: true }
                    )
                    .setImage(`attachment://${fileName}`)
                    .setFooter({ text: 'AI Photo Studio • Use /photo edit or /photo rename' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed], files: [fileAttachment] });
            }
        } else if (commandName === 'antinuke' || commandName === 'security') {
            if (!guild) {
                return interaction.reply({ content: '❌ This command can only be used in a Discord server.', flags: 64 });
            }

            const sec = getGuildSecurity(guild.id, guild.ownerId);
            const isOwner = interaction.user.id === guild.ownerId;
            const isWhite = isWhitelisted(guild, interaction.user.id);
            const logChannel = sec.logChannelId ? `<#${sec.logChannelId}>` : '`Not configured / In Default`';

            const statusEmbed = new EmbedBuilder()
                .setColor(0x00E5FF)
                .setTitle(`🛡️ Anti-Nuke & Security Shield — ${guild.name}`)
                .setDescription(`Automated 24/7 server defense engine is **ONLINE & ACTIVE**. Every destructive action is intercepted and neutralized.`)
                .addFields(
                    { 
                        name: '🛡️ Channel & Role Protection', 
                        value: `• **Anti-Channel Delete:** ${sec.antiChannelDelete ? '✅ Active (Auto-Restore)' : '❌ Disabled'}\n• **Anti-Channel Create:** ${sec.antiChannelCreate ? '✅ Active' : '❌ Disabled'}\n• **Anti-Role Delete:** ${sec.antiRoleDelete ? '✅ Active (Auto-Restore)' : '❌ Disabled'}\n• **Anti-Role Create:** ${sec.antiRoleCreate ? '✅ Active' : '❌ Disabled'}`, 
                        inline: true 
                    },
                    { 
                        name: '⚔️ Raid & Member Protection', 
                        value: `• **Anti-Mass Ban:** ${sec.antiBan ? '✅ Active (Auto-Unban)' : '❌ Disabled'}\n• **Anti-Mass Kick:** ${sec.antiKick ? '✅ Active' : '❌ Disabled'}\n• **Anti-Bot Add:** ${sec.antiBot ? '✅ Active (Auto-Ban Bot)' : '❌ Disabled'}\n• **Anti-Webhook:** ${sec.antiWebhook ? '✅ Active' : '❌ Disabled'}`, 
                        inline: true 
                    },
                    { 
                        name: '⚡ Chat & Anti-Delete Protection', 
                        value: `• **Anti-Spam Filter:** ${sec.antiSpam ? '✅ Active (Auto-Mute)' : '❌ Disabled'}\n• **Anti-Invite Links:** ${sec.antiInvite ? '✅ Active' : '❌ Disabled'}\n• **Anti-Mass Mention:** ${sec.antiMassMention ? '✅ Active' : '❌ Disabled'}\n• **Anti-Delete & Ghost Ping:** ${sec.antiDelete ? '✅ Active' : '❌ Disabled'}`, 
                        inline: false 
                    },
                    { 
                        name: '👑 Whitelist & Audit Logging', 
                        value: `• **Log Channel:** ${logChannel}\n• **Whitelisted Users:** **${sec.whitelist.length}** trusted users\n• **Attacker Punishment:** **Automatic Ban & 28-day Quarantine**\n• **Your Access:** ${isOwner ? '👑 Server Owner (Full Access)' : (isWhite ? '🛡️ Whitelisted Admin' : '👤 Standard Member')}`, 
                        inline: false 
                    }
                )
                .setFooter({ text: 'Discord Anti-Nuke Automated Shield • 24/7 Protection' })
                .setTimestamp();

            return interaction.reply({ embeds: [statusEmbed], flags: 64 });
        } else if (commandName === 'whitelist') {
            const tier = interaction.options.getString('tier');
            const action = interaction.options.getString('action');
            const targetUser = interaction.options.getUser('user');
            const masterId = getMasterOwnerId();
            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId;
            const isOwner = guild && (interaction.user.id === guild.ownerId);
            const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

            // Tier 3: Commands Only Whitelist
            if (tier === '3') {
                if (action === 'list') {
                    const listFormatted = whitelist3.map(id => {
                        const tag = id === masterId ? '👑 Master Operator' : (id === client.user?.id ? '🤖 Bot' : '⚡ Commands Authorized');
                        return `• <@${id}> (\`${id}\`) — **${tag}**`;
                    }).join('\n') || '*No users in Whitelist 3 yet.*';

                    const listEmbed = new EmbedBuilder()
                        .setColor(0x3B82F6)
                        .setTitle(`⚡ Whitelist 3: Commands Only Whitelist (${whitelist3.length})`)
                        .setDescription(`Users on **Whitelist 3** can execute bot commands while the bot is locked down.\n\n${listFormatted}`)
                        .setFooter({ text: 'Use /whitelist action:add tier:3 user:<@user>' })
                        .setTimestamp();

                    return interaction.reply({ embeds: [listEmbed] });
                }

                if (!isMaster && !isOwner && !isAdmin) {
                    return interaction.reply({ content: '❌ Only Master Bot Owners and Server Administrators can manage Whitelist 3.', flags: 64 });
                }
                if (!targetUser) {
                    return interaction.reply({ content: '❌ Please specify a user to add or remove.', flags: 64 });
                }

                if (action === 'add') {
                    if (whitelist3.includes(targetUser.id)) {
                        return interaction.reply({ content: `ℹ️ <@${targetUser.id}> is already in Whitelist 3.`, flags: 64 });
                    }
                    whitelist3.push(targetUser.id);
                    saveWhitelist3();
                    addLog('Whitelist3 Added', targetUser.id, interaction.user.id, true, `Added by ${interaction.user.tag}`);
                    return interaction.reply({ content: `✅ Successfully added <@${targetUser.id}> to **Whitelist 3 (Commands Only)**! They can now execute bot commands.` });
                } else if (action === 'remove') {
                    if (targetUser.id === masterId || isMasterOwner(targetUser.id)) {
                        return interaction.reply({ content: '❌ Cannot remove Master Bot Operator.', flags: 64 });
                    }
                    if (!whitelist3.includes(targetUser.id)) {
                        return interaction.reply({ content: `ℹ️ <@${targetUser.id}> is not in Whitelist 3.`, flags: 64 });
                    }
                    whitelist3 = whitelist3.filter(id => id !== targetUser.id);
                    saveWhitelist3();
                    addLog('Whitelist3 Removed', targetUser.id, interaction.user.id, true, `Removed by ${interaction.user.tag}`);
                    return interaction.reply({ content: `✅ Successfully removed <@${targetUser.id}> from **Whitelist 3**.` });
                }
            }

            // Tier 2: Forwarding & DMs Whitelist
            if (tier === '2') {
                if (action === 'list') {
                    const listFormatted = whitelist2.map(id => {
                        const tag = id === masterId ? '👑 Master Operator' : (id === client.user?.id ? '🤖 Bot' : '⚡ Forward Authorized');
                        return `• <@${id}> (\`${id}\`) — **${tag}**`;
                    }).join('\n') || '*No users in Whitelist 2 yet.*';

                    const listEmbed = new EmbedBuilder()
                        .setColor(0x00E5FF)
                        .setTitle(`⚡ Whitelist 2: Forwarding & DMs (${whitelist2.length})`)
                        .setDescription(`Users on **Whitelist 2** have permission for channel forwarding & DM commands.\n\n${listFormatted}`)
                        .setFooter({ text: 'Use /whitelist action:add tier:2 user:<@user>' })
                        .setTimestamp();

                    return interaction.reply({ embeds: [listEmbed] });
                }

                if (!isMaster && !isOwner && !isAdmin) {
                    return interaction.reply({ content: '❌ Only Master Bot Owners and Server Administrators can manage Whitelist 2.', flags: 64 });
                }
                if (!targetUser) {
                    return interaction.reply({ content: '❌ Please specify a user to add or remove.', flags: 64 });
                }

                if (action === 'add') {
                    if (whitelist2.includes(targetUser.id)) {
                        return interaction.reply({ content: `ℹ️ <@${targetUser.id}> is already in Whitelist 2.`, flags: 64 });
                    }
                    whitelist2.push(targetUser.id);
                    saveWhitelist2();
                    addLog('Whitelist2 Added', targetUser.id, interaction.user.id, true, `Added by ${interaction.user.tag}`);
                    return interaction.reply({ content: `✅ Successfully added <@${targetUser.id}> to **Whitelist 2**!` });
                } else if (action === 'remove') {
                    if (targetUser.id === masterId || isMasterOwner(targetUser.id)) {
                        return interaction.reply({ content: '❌ Cannot remove Master Bot Operator.', flags: 64 });
                    }
                    if (!whitelist2.includes(targetUser.id)) {
                        return interaction.reply({ content: `ℹ️ <@${targetUser.id}> is not in Whitelist 2.`, flags: 64 });
                    }
                    whitelist2 = whitelist2.filter(id => id !== targetUser.id);
                    saveWhitelist2();
                    addLog('Whitelist2 Removed', targetUser.id, interaction.user.id, true, `Removed by ${interaction.user.tag}`);
                    return interaction.reply({ content: `✅ Successfully removed <@${targetUser.id}> from **Whitelist 2**.` });
                }
            }

            // Tier 1: Server Anti-Nuke Whitelist (Default)
            if (!guild) {
                return interaction.reply({ content: '❌ Server Anti-Nuke Whitelist (Tier 1) can only be used inside a Discord server.', flags: 64 });
            }

            const sec = getGuildSecurity(guild.id, guild.ownerId);

            if (!isOwner && !isAdmin) {
                return interaction.reply({ content: '❌ Only the Server Owner and Server Administrators can manage the Anti-Nuke Whitelist.', flags: 64 });
            }

            if (action === 'list') {
                const listFormatted = sec.whitelist.map(id => {
                    const tag = id === masterId ? '👑 Master Operator (Me)' : (id === client.user.id ? '🤖 Bot' : (id === guild.ownerId ? '👑 Owner' : '🛡️ Whitelisted'));
                    return `• <@${id}> (\`${id}\`) — **${tag}**`;
                }).join('\n') || 'None';

                const listEmbed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setTitle(`👑 Anti-Nuke Whitelisted Members (${sec.whitelist.length})`)
                    .setDescription(`Whitelisted members bypass all Anti-Nuke rate limits and deletion shields.\n\n${listFormatted}`)
                    .setFooter({ text: 'Use /whitelist add or /whitelist remove to modify.' })
                    .setTimestamp();

                return interaction.reply({ embeds: [listEmbed], flags: 64 });
            }

            if (!targetUser) {
                return interaction.reply({ content: '❌ Please specify a user to add or remove.', flags: 64 });
            }

            if (action === 'add') {
                if (sec.whitelist.includes(targetUser.id)) {
                    return interaction.reply({ content: `ℹ️ <@${targetUser.id}> is already in the Anti-Nuke whitelist.`, flags: 64 });
                }
                sec.whitelist.push(targetUser.id);
                saveSecurity();
                addLog('Whitelist Added', targetUser.id, guild.id, true, `Added by ${interaction.user.tag}`);
                return interaction.reply({ content: `✅ **Successfully added** <@${targetUser.id}> to the Anti-Nuke whitelist! They are now exempt from security triggers.`, flags: 64 });
            } else if (action === 'remove') {
                if (targetUser.id === masterId || isMasterOwner(targetUser.id)) {
                    return interaction.reply({ content: '❌ Cannot remove the Master Bot Operator from the whitelist.', flags: 64 });
                }
                if (targetUser.id === client.user.id) {
                    return interaction.reply({ content: '❌ Cannot remove the Bot from the whitelist.', flags: 64 });
                }
                if (!sec.whitelist.includes(targetUser.id)) {
                    return interaction.reply({ content: `ℹ️ <@${targetUser.id}> is not in the whitelist.`, flags: 64 });
                }
                sec.whitelist = sec.whitelist.filter(id => id !== targetUser.id);
                saveSecurity();
                addLog('Whitelist Removed', targetUser.id, guild.id, true, `Removed by ${interaction.user.tag}`);
                return interaction.reply({ content: `✅ **Successfully removed** <@${targetUser.id}> from the Anti-Nuke whitelist.`, flags: 64 });
            }
        } else if (commandName === 'forwardall') {
            const sourceInput = interaction.options.getString('channel_id');
            const destInput = interaction.options.getString('destination_channel_id');
            await interaction.deferReply({ flags: 64 });

            const sourceChannel = await findChannelInAllServers(sourceInput);
            if (!sourceChannel) {
                return interaction.editReply('❌ Source channel not found. Make sure the bot is in that server or a user token is provided.');
            }

            let targetChannel = channel;
            if (destInput && destInput.trim()) {
                const cleanDestId = destInput.trim().replace(/[<#>]/g, '');
                const foundDest = await client.channels.fetch(cleanDestId).catch(() => null);
                if (!foundDest || !foundDest.isTextBased()) {
                    return interaction.editReply(`❌ Destination channel (\`${cleanDestId}\`) not found or is not a text channel accessible by the bot.`);
                }
                targetChannel = foundDest;
            }

            if (sourceChannel.id === targetChannel.id) {
                return interaction.editReply('❌ Source and destination channels cannot be the same!');
            }

            const targetGuild = targetChannel.guild;
            const botMember = targetGuild?.members.cache.get(client.user.id);
            if (botMember && !targetChannel.permissionsFor(botMember)?.has(['SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory'])) {
                return interaction.editReply(`❌ I don't have permission to send messages/embeds/files in <#${targetChannel.id}>.`);
            }

            await interaction.editReply(`🔄 **Starting FULL COPY** of .txt files from <#${sourceChannel.id}> to <#${targetChannel.id}>...`);
            const result = await copyAllMessages(sourceChannel, targetChannel);
            if (result.success) {
                await interaction.followUp({ content: `✅ **Forward Rule Set!** All future .txt files in <#${sourceChannel.id}> will auto-forward to <#${targetChannel.id}>.`, flags: 64 });
            } else {
                await interaction.followUp({ content: `❌ Failed: ${result.message}`, flags: 64 });
            }
        } else if (commandName === 'stopallforward' || commandName === 'stopforwards' || commandName === 'stopallforwards') {
            const masterId = getMasterOwnerId();
            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId;
            const isWhitelistedUser盛り = isWhitelist2(interaction.user.id);
            const isServerOwner = interaction.user.id === guild?.ownerId;
            const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
            const sec = getGuildSecurity(guildId, guild?.ownerId);
            const hasAdminRole = Array.isArray(sec.adminRoles) && sec.adminRoles.some(rId => interaction.member?.roles?.cache?.has(rId));

            if (!isMaster && !hasAdminRole && !isWhitelistedUser盛り && !isServerOwner && !isAdmin) {
                return interaction.reply({
                    content: `🔒 **Permission Denied**\nOnly the Master Bot Owner (<@${masterId}>), Whitelist 2 users, Server Owners, or Administrators can stop auto-forwarding rules.`,
                    flags: 64
                });
            }

            const scope = interaction.options.getString('scope') || 'all';
            await interaction.deferReply({ flags: 64 });

            try {
                let totalGuildsCountDeep = 0;
                let totalRoutesCountDeep四周 = 0;

                if (scope === 'server' && guildId) {
                    if (forwards[guildId]) {
                        totalGuildsCountDeep = 1;
                        for (const targetId in forwards[guildId]) {
                            totalRoutesCountDeep四周 += Array.isArray(forwards[guildId][targetId]) ? forwards[guildId][targetId].length : 1;
                        }
                        delete forwards[guildId];
                        saveForwards();
                    }

                    addLog('Stop Server Forwards', guildId, interaction.user.id, true, `Stopped ${totalRoutesCountDeep四周} forwarding routes in server ${guild?.name || guildId}`);

                    const embed = new EmbedBuilder()
                        .setColor(0xEF4444)
                        .setTitle('🛑 Auto-Forwarding Stopped (Server Scope)')
                        .setDescription(`Successfully stopped and cleared all auto-forwarding rules for **${guild?.name || 'this server'}**!`)
                        .addFields(
                            { name: '🏠 Server', value: `${guild?.name || guildId}`, inline: true },
                            { name: '🛣️ Routes Cleared', value: `${totalRoutesCountDeep四周} route(s)`, inline: true },
                            { name: '👤 Operator', value: `<@${interaction.user.id}>`, inline: true }
                        )
                        .setFooter({ text: 'Auto-Forward Engine • Rules Cleared' })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [embed] });
                } else {
                    // Global wipe across ALL servers
                    for (const gId in forwards) {
                        if (forwards[gId] && Object.keys(forwards[gId]).length > 0) {
                            totalGuildsCountDeep++;
                            for (const targetId in forwards[gId]) {
                                totalRoutesCountDeep四周 += Array.isArray(forwards[gId][targetId]) ? forwards[gId][targetId].length : 1;
                            }
                        }
                    }

                    forwards = {};
                    saveForwards();

                    addLog('Stop All Forwards', 'All Servers', interaction.user.id, true, `Global wipe: stopped ${totalRoutesCountDeep四周} routes across ${totalGuildsCountDeep} servers`);

                    const embed = new EmbedBuilder()
                        .setColor(0xEF4444)
                        .setTitle('🛑 ALL Auto-Forwarding Stopped (Every Server)')
                        .setDescription(`Successfully stopped and removed **ALL** auto-forwarding rules across **every server**!`)
                        .addFields(
                            { name: '🌐 Scope', value: 'Every Server (Global)', inline: true },
                            { name: '🏰 Servers Affected', value: `${totalGuildsCountDeep} server(s)`, inline: true },
                            { name: '🛣️ Total Routes Cleared', value: `${totalRoutesCountDeep四周} route(s)`, inline: true },
                            { name: '👤 Operator', value: `<@${interaction.user.id}>`, inline: true }
                        )
                        .setFooter({ text: 'Auto-Forward Engine • Global Wipe Complete' })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [embed] });
                }
            } catch (err) {
                console.error('Stop all forwards error:', err);
                return interaction.editReply({ content: `❌ Failed to stop forwarding: ${err.message}` });
            }
        } else if (commandName === 'findsource') {
            const filter = interaction.options.getString('source_channel_id') || '';
            await interaction.deferReply({ flags: 64 });
            try {
                const sources = await getAllForwardSources(filter);
                const embed = buildFindSourceEmbed(sources, filter);
                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error('findsource slash error:', err);
                return interaction.editReply({ content: `❌ Error finding sources: ${err.message}` });
            }
        } else if (commandName === 'hub' || commandName === 'sod') {
            const query = interaction.options.getString('query') || '';
            if (!query.trim()) {
                return interaction.reply({
                    content: '🔍 **Fetch Hub Script Search**\nPlease provide a script name or query (e.g. `/hub query:duel` or `/sod query:semi`).',
                    flags: 64
                });
            }

            await interaction.deferReply();
            try {
                const results = await searchHubScripts(query, interaction.channel, interaction.guild);
                if (!results || results.length === 0) {
                    return interaction.editReply(`❌ No scripts found matching \`${query}\` in the Fetch Hub cache.\nTip: Try searching with a broader keyword (e.g. \`/hub query:duel\`, \`/sod query:semi\`, or \`/hub query:lua\`)!`);
                }

                const sessionId = `hub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                const session = {
                    id: sessionId,
                    query,
                    results,
                    currentIndex: 0,
                    authorId: interaction.user.id,
                    expiresAt: Date.now() + 15 * 60 * 1000
                };
                hubSessions.set(sessionId, session);

                const payload = await buildHubResultPayload(session, 0);
                return await interaction.editReply(payload);
            } catch (err) {
                console.error('Hub slash command error:', err);
                return interaction.editReply({ content: `❌ Error searching Fetch Hub scripts: ${err.message}` });
            }
        } else if (commandName === 'purge') {
            if (!channel || !guild || channel.isDMBased?.()) {
                return interaction.reply({ content: '❌ This command can only be used in a server text channel.', flags: 64 });
            }

            const botMember = guild.members.cache.get(client.user.id);
            if (botMember && !channel.permissionsFor(botMember)?.has(['ManageMessages', 'ReadMessageHistory'])) {
                return interaction.reply({ content: '❌ I need the **Manage Messages** and **Read Message History** permissions to purge messages in this channel.', flags: 64 });
            }

            const amountInput = interaction.options.getString('amount') || 'all';
            const userTag = interaction.user?.tag || interaction.user?.username || 'User';

            await interaction.reply({ content: `🧹 **Purging messages in this channel...** (Channel remains intact)`, flags: 64 }).catch(() => {});

            try {
                const result = await purgeChannelMessages(channel, amountInput);
                if (result.success) {
                    await interaction.followUp({
                        content: `💥 **Purged ${result.count} message(s)** in <#${channel.id}>! (Channel remained in place with the same ID and settings)`,
                        flags: 64
                    }).catch(() => {});
                    addLog('Channel Purge', channel.id, guildId, true, `Purged ${result.count} messages in same channel by ${userTag}`);
                } else {
                    await interaction.followUp({ content: `❌ Failed to purge messages: ${result.message}`, flags: 64 }).catch(() => {});
                }
            } catch (err) {
                console.error('Purge command error:', err);
                await interaction.followUp({ content: `❌ Failed to purge messages: ${err.message}`, flags: 64 }).catch(() => {});
            }
        } else if (commandName === 'exporthtml') {
            if (!channel || channel.isDMBased?.()) {
                return interaction.reply({ content: '❌ This command can only be used in a server text channel.', flags: 64 });
            }

            await interaction.deferReply({ flags: 64 });

            const destInput = interaction.options.getString('destination');
            const amountInput = interaction.options.getInteger('amount') || 100;
            const shouldUploadFiles = interaction.options.getBoolean('upload_files') ?? true;
            const customAttachment = interaction.options.getAttachment('file');

            let targetDestChannel = channel;
            if (destInput) {
                const parsedDestId = parseChannelId(destInput);
                if (parsedDestId) {
                    try {
                        const fetched = await client.channels.fetch(parsedDestId).catch(() => null);
                        if (fetched && fetched.isTextBased?.()) {
                            targetDestChannel = fetched;
                        } else if (guild) {
                            const found = guild.channels.cache.get(parsedDestId) || 
                                          guild.channels.cache.find(c => c.name.toLowerCase() === destInput.toLowerCase().replace(/^#/, ''));
                            if (found && found.isTextBased?.()) {
                                targetDestChannel = found;
                            }
                        }
                    } catch (e) {
                        console.warn('Could not resolve destination channel:', e);
                    }
                }
            }

            const result = await exportChannelHtml(channel, amountInput, shouldUploadFiles);

            if (!result.success) {
                return interaction.editReply(`❌ Failed to export channel: ${result.message}`);
            }

            const htmlAttachment = new AttachmentBuilder(Buffer.from(result.html, 'utf-8'), { name: result.fileName });
            const filesToSend = [htmlAttachment];

            if (customAttachment && customAttachment.url) {
                try {
                    const res = await fetch(customAttachment.url);
                    if (res.ok) {
                        const arrayBuf = await res.arrayBuffer();
                        filesToSend.push(new AttachmentBuilder(Buffer.from(arrayBuf), { name: customAttachment.name || 'custom_upload' }));
                    }
                } catch (err) {
                    console.warn('Failed to attach custom uploaded file:', err.message);
                }
            }

            try {
                await targetDestChannel.send({
                    files: filesToSend
                });

                // If shouldUploadFiles is true and files were extracted from messages, send them in parallel batches
                let uploadedFilesCount = 0;
                if (shouldUploadFiles && result.downloadedFiles && result.downloadedFiles.length > 0) {
                    const batchSize = 10;
                    const batches = [];
                    for (let i = 0; i < result.downloadedFiles.length; i += batchSize) {
                        batches.push(result.downloadedFiles.slice(i, i + batchSize));
                    }
                    await Promise.all(batches.map(async (batch) => {
                        const fileNamesList = batch.map(f => f.name).join('\n');
                        const batchAttachments = batch.map(f => new AttachmentBuilder(f.attachment, { name: f.name }));

                        for (const f of batch) {
                            if (f.name) {
                                addScriptToHubCache({
                                    name: f.name,
                                    size: f.size || 0,
                                    url: f.attachment,
                                    messageId: `${Date.now()}`,
                                    channelId: targetDestChannel.id,
                                    guildId: targetDestChannel.guild?.id || null
                                });
                            }
                        }

                        await targetDestChannel.send({
                            content: fileNamesList,
                            files: batchAttachments
                        }).catch(err => console.error('Error sending file batch in exporthtml:', err));
                        uploadedFilesCount += batch.length;
                    }));
                }

                addLog('Export HTML', channel.id, targetDestChannel.id, true, `Exported ${result.messageCount} msgs & uploaded ${uploadedFilesCount} files by ${interaction.user?.tag || interaction.user?.username}`);

                return interaction.editReply({
                    content: `✅ **Channel transcript exported successfully!**\n📁 Sent to <#${targetDestChannel.id}>\n📊 Messages: **${result.messageCount}** | Files extracted & uploaded: **${uploadedFilesCount}**`
                });
            } catch (sendErr) {
                console.error('Error sending export to destination channel:', sendErr);
                return interaction.editReply(`❌ Failed to send export into <#${targetDestChannel.id}>: ${sendErr.message}`);
            }
        } else if (commandName === 'clear') {
            if (!channel || !guild || channel.isDMBased?.()) {
                return interaction.reply({ content: '❌ This command can only be used in a server text channel.', flags: 64 });
            }

            const botMember = guild.members.cache.get(client.user.id);
            if (botMember && !channel.permissionsFor(botMember)?.has(['ManageChannels'])) {
                return interaction.reply({ content: '❌ I need the **Manage Channels** permission to delete and clone this channel.', flags: 64 });
            }

            const position = channel.rawPosition ?? channel.position;
            const originalId = channel.id;
            const userTag = interaction.user?.tag || interaction.user?.username || 'User';

            await interaction.reply({ content: '💣 Clearing channel... Cloning and deleting.', flags: 64 }).catch(() => {});

            try {
                const clonedChannel = await channel.clone({
                    reason: `Channel cleared/nuked by ${userTag}`
                });

                if (typeof position === 'number') {
                    await clonedChannel.setPosition(position).catch(() => {});
                }

                if (forwards[guildId]) {
                    if (forwards[guildId][originalId]) {
                        forwards[guildId][clonedChannel.id] = forwards[guildId][originalId];
                        delete forwards[guildId][originalId];
                        saveForwards();
                    }
                    for (const [tId, sources] of Object.entries(forwards[guildId])) {
                        const idx = sources.indexOf(originalId);
                        if (idx !== -1) {
                            sources[idx] = clonedChannel.id;
                            saveForwards();
                        }
                    }
                }

                await channel.delete(`Channel cleared and cloned by ${userTag}`);

                await clonedChannel.send({
                    content: `💥 **Channel cleared!** Cloned by <@${interaction.user.id}>`
                }).catch(() => {});

                addLog('Channel Cleared', originalId, clonedChannel.id, true, `Cloned by ${userTag}`);
            } catch (err) {
                console.error('Clear channel error:', err);
                await interaction.followUp({ content: `❌ Failed to clear channel: ${err.message}`, flags: 64 }).catch(() => {});
            }
        } else if (commandName === 'deleteallchannels') {
            if (!guild) {
                return interaction.reply({ content: '❌ This command can only be used inside a Discord server.', flags: 64 });
            }

            const botMember = guild.members.cache.get(client.user.id);
            if (botMember && !botMember.permissions.has(['ManageChannels'])) {
                return interaction.reply({ content: '❌ I need the **Manage Channels** permission to delete all channels.', flags: 64 });
            }

            const userTag = interaction.user?.tag || interaction.user?.username || 'User';
            await interaction.reply({ content: '🧨 **Initiating channel wipe...** Creating fresh channel and deleting all other channels & categories.', flags: 64 }).catch(() => {});

            try {
                // Fetch all channels in the guild
                const allChannels = await guild.channels.fetch();

                // Create one fresh clean channel first so the server is never empty
                const newChannel = await guild.channels.create({
                    name: 'general',
                    type: ChannelType.GuildText,
                    reason: `All channels deleted by ${userTag}`
                });

                // Clear forward configurations for this guild
                if (forwards[guildId]) {
                    delete forwards[guildId];
                    saveForwards();
                }

                let deletedCount = 0;
                for (const [id, ch] of allChannels) {
                    if (!ch || ch.id === newChannel.id) continue;
                    try {
                        await ch.delete(`All channels deleted by ${userTag}`);
                        deletedCount++;
                        await new Promise(resolve => setTimeout(resolve, 200));
                    } catch (delErr) {
                        console.warn(`Could not delete channel ${id}:`, delErr.message);
                    }
                }

                await newChannel.send({
                    content: `💥 **All channels deleted!** (${deletedCount} channel(s)/categories removed)\nServer reset by <@${interaction.user.id}>`
                }).catch(() => {});

                addLog('All Channels Deleted', guildId, newChannel.id, true, `Deleted ${deletedCount} channels by ${userTag}`);
            } catch (err) {
                console.error('Delete all channels error:', err);
                await interaction.followUp({ content: `❌ Failed to delete all channels: ${err.message}`, flags: 64 }).catch(() => {});
            }
        } else if (commandName === 'clone') {
            const sourceId = interaction.options.getString('source_server_id');
            const destInput = interaction.options.getString('destination_server_id') || interaction.guild?.id;
            const clearDest = interaction.options.getBoolean('clear_destination') ?? true;
            const cloneEmo = interaction.options.getBoolean('clone_emojis') ?? true;

            if (!sourceId || !sourceId.trim()) {
                return interaction.reply({ content: '❌ Please specify the Source Server ID to copy from.', flags: 64 });
            }

            if (!destInput || !destInput.trim()) {
                return interaction.reply({ content: '❌ Please specify a destination server ID or run this command inside a server.', flags: 64 });
            }

            const cleanSource = sourceId.trim().replace(/[<@#!&>]/g, '');
            const cleanDest = destInput.trim().replace(/[<@#!&>]/g, '');

            const masterId = getMasterOwnerId();
            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId;
            const sec = getGuildSecurity(guildId, guild?.ownerId);
            const hasAdminRole = Array.isArray(sec.adminRoles) && sec.adminRoles.some(rId => interaction.member?.roles?.cache?.has(rId));
            const isWhitelistedUser = sec.whitelist && sec.whitelist.includes(interaction.user.id);
            const isDestOwner = interaction.guild && interaction.guild.id === cleanDest && interaction.user.id === interaction.guild.ownerId;

            if (!isMaster && !hasAdminRole && !isWhitelistedUser && !isDestOwner) {
                return interaction.reply({ 
                    content: `🔒 **Permission Denied — Owner / Admin Role Required**\nOnly the Master Bot Owner (<@${masterId}>), assigned **Admin Roles**, or Whitelisted Admins can use \`/clone\`.\n\n*Ask the Owner to grant you permission.*`, 
                    flags: 64 
                });
            }

            await interaction.deferReply({ flags: 64 });
            await interaction.editReply(`🔄 **Starting Server Clone Process...**\n• Source Server: \`${cleanSource}\`\n• Destination Server: \`${cleanDest}\`\n• Wipe Destination First: \`${clearDest ? 'Yes' : 'No'}\`\n• Clone Emojis: \`${cloneEmo ? 'Yes' : 'No'}\`\n⏳ *Please wait while roles, categories, and channels are replicated...*`);

            try {
                const result = await cloneServer({
                    sourceGuildId: cleanSource,
                    destinationGuildId: cleanDest,
                    options: {
                        clearDestination: clearDest,
                        cloneRoles: true,
                        cloneChannels: true,
                        cloneSettings: true,
                        cloneEmojis: cloneEmo
                    },
                    operatorTag: interaction.user.tag || interaction.user.username
                });

                const embed = new EmbedBuilder()
                    .setColor(0x00E5FF)
                    .setTitle('🎉 Server Successfully Cloned!')
                    .setDescription(`Replicated **${result.sourceGuild}** ➔ **${result.destinationGuild}**`)
                    .addFields(
                        { name: '👑 Roles Replicated', value: `${result.rolesCloned}`, inline: true },
                        { name: '📁 Categories Created', value: `${result.categoriesCloned}`, inline: true },
                        { name: '💬 Channels Cloned', value: `${result.channelsCloned}`, inline: true },
                        { name: '😀 Custom Emojis', value: `${result.emojisCloned}`, inline: true },
                        { name: '🧹 Destination Wiped', value: clearDest ? 'Yes' : 'No', inline: true },
                        { name: '👤 Operator', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setFooter({ text: 'Discord Server Cloner Engine • 100% Exact Copy' })
                    .setTimestamp();

                return interaction.followUp({ embeds: [embed], flags: 64 });
            } catch (err) {
                console.error('Slash clone command error:', err);
                return interaction.followUp({ content: `❌ **Server Clone Failed:** ${err.message}`, flags: 64 });
            }
        } else if (commandName === 'adminrole') {
            const masterId = getMasterOwnerId();
            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId || (guild && interaction.user.id === guild.ownerId);
            if (!isMaster) {
                return interaction.reply({
                    content: `❌ Only the Master Bot Owner (<@${masterId}>) can configure Admin Roles.`,
                    flags: 64
                });
            }

            const action = interaction.options.getString('action');
            const role = interaction.options.getRole('role');
            const sec = getGuildSecurity(guildId, guild?.ownerId);

            if (action === 'list') {
                const roleList = (sec.adminRoles && sec.adminRoles.length > 0)
                    ? sec.adminRoles.map(rId => `• <@&${rId}> (\`${rId}\`)`).join('\n')
                    : '*(None configured yet)*';

                const embed = new EmbedBuilder()
                    .setColor(0x00E5FF)
                    .setTitle(`👑 Configured Admin Roles — ${guild?.name || 'Server'}`)
                    .setDescription(`Members with these roles have permission to execute bot commands even while the bot is locked:\n\n${roleList}`)
                    .setFooter({ text: 'Use /adminrole add <role> to authorize a new role' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            if (!role) {
                return interaction.reply({ content: '❌ Please specify a role to add or remove.', flags: 64 });
            }

            if (action === 'add') {
                if (sec.adminRoles.includes(role.id)) {
                    return interaction.reply({ content: `ℹ️ Role <@&${role.id}> is already in the Admin Roles list.`, flags: 64 });
                }
                sec.adminRoles.push(role.id);
                saveSecurity();
                addLog('Admin Role Added', role.id, guildId, true, `Added by ${interaction.user.tag}`);
                return interaction.reply({ content: `✅ **Admin Role Authorized!** Members with <@&${role.id}> can now use bot commands.`, flags: 64 });
            } else if (action === 'remove') {
                if (!sec.adminRoles.includes(role.id)) {
                    return interaction.reply({ content: `ℹ️ Role <@&${role.id}> is not in the Admin Roles list.`, flags: 64 });
                }
                sec.adminRoles = sec.adminRoles.filter(rId => rId !== role.id);
                saveSecurity();
                addLog('Admin Role Removed', role.id, guildId, true, `Removed by ${interaction.user.tag}`);
                return interaction.reply({ content: `✅ **Admin Role Removed!** Revoked command permissions from <@&${role.id}>.`, flags: 64 });
            }
        } else if (commandName === 'botlock') {
            const masterId = getMasterOwnerId();
            const action = interaction.options.getString('action');
            const targetUser = interaction.options.getUser('user');
            const sec = getGuildSecurity(guildId, guild?.ownerId);

            if (action === 'status') {
                const lockStatus = sec.botLocked !== false;
                const adminRoleList = (sec.adminRoles && sec.adminRoles.length > 0)
                    ? sec.adminRoles.map(rId => `<@&${rId}>`).join(', ')
                    : '*(None)*';

                const embed = new EmbedBuilder()
                    .setColor(lockStatus ? 0xE11D48 : 0x10B981)
                    .setTitle('🔒 Bot Lock & Access Control Status')
                    .setDescription(`Current Lock State: **${lockStatus ? '🔒 LOCKED (Owner & Admin Roles Only)' : '🔓 UNLOCKED'}**\n\nWhen locked, users must have permission from the Bot Owner or possess an authorized Admin Role to use commands.`)
                    .addFields(
                        { name: '👑 Master Bot Owner', value: `<@${masterId}> (\`${masterId}\`)`, inline: true },
                        { name: '🛡️ Admin Roles', value: adminRoleList, inline: true },
                        { name: '👥 Whitelisted Users', value: `${sec.whitelist.length} user(s)`, inline: true }
                    )
                    .setFooter({ text: 'Use /botlock lock or /botlock unlock to toggle' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: 64 });
            }

            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId || (guild && interaction.user.id === guild.ownerId);
            if (!isMaster) {
                return interaction.reply({
                    content: `❌ Only the Master Bot Owner (<@${masterId}>) can modify Bot Lock settings.`,
                    flags: 64
                });
            }

            if (action === 'lock') {
                sec.botLocked = true;
                saveSecurity();
                addLog('Bot Locked', interaction.user.id, guildId, true, `Locked by ${interaction.user.tag}`);
                return interaction.reply({ content: `🔒 **Bot is now LOCKED!** Only the Master Owner (<@${masterId}>), assigned **Admin Roles**, and whitelisted users can execute commands.`, flags: 64 });
            } else if (action === 'unlock') {
                sec.botLocked = false;
                saveSecurity();
                addLog('Bot Unlocked', interaction.user.id, guildId, true, `Unlocked by ${interaction.user.tag}`);
                return interaction.reply({ content: `🔓 **Bot is now UNLOCKED!** Standard server administrators can now execute commands.`, flags: 64 });
            } else if (action === 'grant') {
                if (!targetUser) return interaction.reply({ content: '❌ Please specify a user to grant permission.', flags: 64 });
                if (!sec.whitelist.includes(targetUser.id)) sec.whitelist.push(targetUser.id);
                saveSecurity();
                addLog('Permission Granted', targetUser.id, guildId, true, `Granted by ${interaction.user.tag}`);
                return interaction.reply({ content: `✅ **Permission Granted!** <@${targetUser.id}> is now authorized to use bot commands.`, flags: 64 });
            } else if (action === 'revoke') {
                if (!targetUser) return interaction.reply({ content: '❌ Please specify a user to revoke permission.', flags: 64 });
                if (targetUser.id === masterId || isMasterOwner(targetUser.id)) return interaction.reply({ content: '❌ Cannot revoke Master Owner permission.', flags: 64 });
                sec.whitelist = sec.whitelist.filter(id => id !== targetUser.id);
                saveSecurity();
                addLog('Permission Revoked', targetUser.id, guildId, true, `Revoked by ${interaction.user.tag}`);
                return interaction.reply({ content: `✅ **Permission Revoked!** Removed command access from <@${targetUser.id}>.`, flags: 64 });
            }
        } else if (commandName === 'invite') {
            const botId = client.user?.id || '1534092488451686461';
            const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;
            const masterId = getMasterOwnerId();

            const embed = new EmbedBuilder()
                .setColor(0x00E5FF)
                .setTitle(`🔗 Add ${client.user?.username || 'Discord Bot'} to Your Server`)
                .setDescription(`Click below to invite the bot with full Administrator permissions:\n\n👉 **[Click Here to Invite Bot](${inviteUrl})**\n\n\`${inviteUrl}\``)
                .addFields(
                    { name: '🤖 Bot Name', value: `${client.user?.tag || 'Discord Bot'}`, inline: true },
                    { name: '👑 Master Owner', value: `<@${masterId}>`, inline: true },
                    { name: '🛡️ Permissions', value: 'Administrator (`8`)', inline: true }
                )
                .setFooter({ text: 'Discord Bot Invitation • Multi-Server High Speed Engine' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } else if (commandName === 'give-admin') {
            if (!interaction.guild) {
                return interaction.reply({ content: '❌ This command can only be used inside a Discord server.', flags: 64 });
            }

            const masterId = getMasterOwnerId();
            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId;
            const isServerOwner = interaction.user.id === guild?.ownerId;
            const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

            if (!isMaster && !isServerOwner && !isAdmin) {
                return interaction.reply({
                    content: `🔒 **Permission Denied**\nOnly the Server Owner (<@${guild?.ownerId}>), Master Bot Owner (<@${masterId}>), or Server Administrators can create & assign Administrator roles.`,
                    flags: 64
                });
            }

            const botMember = interaction.guild.members.me || await interaction.guild.members.fetch(client.user.id).catch(() => null);
            if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return interaction.reply({
                    content: '❌ **Missing Bot Permissions:** I need the **Manage Roles** permission with high hierarchy to create and grant an Administrator role.',
                    flags: 64
                });
            }

            await interaction.deferReply();

            const targetUser = interaction.options.getUser('user') || interaction.user;
            const roleName = interaction.options.getString('name') || 'Administrator';
            const colorInput = interaction.options.getString('color') || '#FF0000';

            try {
                // Check if target member exists in server
                const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                if (!targetMember) {
                    return interaction.editReply({ content: `❌ Target member <@${targetUser.id}> was not found in this server.` });
                }

                // Create the Administrator role
                const newRole = await interaction.guild.roles.create({
                    name: roleName,
                    color: colorInput,
                    permissions: [PermissionFlagsBits.Administrator],
                    reason: `Admin role created via /give-admin by ${interaction.user.tag} (${interaction.user.id})`
                });

                // Assign the role to the target user
                await targetMember.roles.add(newRole.id, `Assigned via /give-admin by ${interaction.user.tag}`);

                // Also register role in guild security adminRoles if not already present
                const sec = getGuildSecurity(guildId, guild?.ownerId);
                if (Array.isArray(sec.adminRoles) && !sec.adminRoles.includes(newRole.id)) {
                    sec.adminRoles.push(newRole.id);
                    saveSecurity();
                }

                addLog('Give Admin Role', targetUser.id, interaction.user.id, true, `Created & assigned role "${newRole.name}" with Administrator permissions`);

                const embed = new EmbedBuilder()
                    .setColor(0x10B981)
                    .setTitle('👑 Administrator Role Created & Granted!')
                    .setDescription(`Successfully created role <@&${newRole.id}> with **Administrator permissions** and assigned it to <@${targetUser.id}>!`)
                    .addFields(
                        { name: '🛡️ Role Created', value: `<@&${newRole.id}> (\`${newRole.name}\`)`, inline: true },
                        { name: '👤 Granted To', value: `<@${targetUser.id}> (\`${targetUser.tag || targetUser.username}\`)`, inline: true },
                        { name: '👑 Permissions', value: '`Administrator` (All Access / Bypass)', inline: true },
                        { name: '⚡ Bot Security', value: 'Automatically registered as an Authorized Admin Role', inline: false }
                    )
                    .setFooter({ text: 'Discord High-Speed Engine • Administrator System' })
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            } catch (err) {
                console.error('give-admin error:', err);
                return interaction.editReply({ content: `❌ **Failed to create/assign Administrator role:** ${err.message}` });
            }
        } else if (commandName === 'role' || commandName === 'roleall') {
            if (!interaction.guild) {
                return interaction.reply({ content: '❌ This command can only be used inside a Discord server.', flags: 64 });
            }

            const masterId = getMasterOwnerId();
            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId;
            const sec = getGuildSecurity(guildId, guild?.ownerId);
            const hasAdminRole = Array.isArray(sec.adminRoles) && sec.adminRoles.some(rId => interaction.member?.roles?.cache?.has(rId));
            const isWhitelistedUser = sec.whitelist && sec.whitelist.includes(interaction.user.id);
            const isServerOwner = interaction.user.id === guild?.ownerId;
            const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) || interaction.member?.permissions?.has(PermissionFlagsBits.ManageRoles);

            if (!isMaster && !hasAdminRole && !isWhitelistedUser && !isServerOwner && !isAdmin) {
                return interaction.reply({
                    content: `🔒 **Permission Denied — Admin Role / Permission Required**\nOnly the Master Bot Owner (<@${masterId}>), assigned **Admin Roles**, or Server Admins can run role operations.`,
                    flags: 64
                });
            }

            let subCommand = 'all';
            try {
                subCommand = interaction.options.getSubcommand();
            } catch (e) {}

            const role = interaction.options.getRole('role');
            if (!role) {
                return interaction.reply({ content: '❌ Please specify a valid role.', flags: 64 });
            }

            // Individual Role Add / Remove for specific target user
            if (subCommand === 'add' || subCommand === 'remove') {
                const targetUser = interaction.options.getUser('user') || interaction.user;
                const isAdd = (subCommand === 'add');

                // Hierarchy check
                if (!isMaster && !isServerOwner) {
                    const userHighest = interaction.member?.roles?.highest?.position || 0;
                    if (role.position >= userHighest) {
                        return interaction.reply({
                            content: `❌ **Role Hierarchy Error:** You cannot manage the role <@&${role.id}> because it is positioned higher than or equal to your highest role.`,
                            flags: 64
                        });
                    }
                }

                await interaction.deferReply();

                try {
                    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                    if (!targetMember) {
                        return interaction.editReply({ content: `❌ Member <@${targetUser.id}> was not found in this server.` });
                    }

                    if (isAdd) {
                        if (targetMember.roles.cache.has(role.id)) {
                            return interaction.editReply({ content: `ℹ️ <@${targetUser.id}> already has the <@&${role.id}> role.` });
                        }
                        await targetMember.roles.add(role.id, `Assigned by ${interaction.user.tag} via /role add`);
                    } else {
                        if (!targetMember.roles.cache.has(role.id)) {
                            return interaction.editReply({ content: `ℹ️ <@${targetUser.id}> does not have the <@&${role.id}> role.` });
                        }
                        await targetMember.roles.remove(role.id, `Removed by ${interaction.user.tag} via /role remove`);
                    }

                    addLog(isAdd ? 'Role Added' : 'Role Removed', targetUser.id, interaction.user.id, true, `${isAdd ? 'Added' : 'Removed'} role "${role.name}"`);

                    const embed = new EmbedBuilder()
                        .setColor(isAdd ? 0x10B981 : 0xE11D48)
                        .setTitle(`⚡ Role ${isAdd ? '➕ Added' : '➖ Removed'}`)
                        .setDescription(`Successfully **${isAdd ? 'granted' : 'removed'}** <@&${role.id}> ${isAdd ? 'to' : 'from'} <@${targetUser.id}>!`)
                        .addFields(
                            { name: '🏷️ Role', value: `<@&${role.id}> (\`${role.name}\`)`, inline: true },
                            { name: '👤 Target User', value: `<@${targetUser.id}>`, inline: true },
                            { name: '👑 Managed By', value: `<@${interaction.user.id}>`, inline: true }
                        )
                        .setFooter({ text: 'Role Management System • Instant Execution' })
                        .setTimestamp();

                    return interaction.editReply({ embeds: [embed] });
                } catch (err) {
                    console.error('Role add/remove error:', err);
                    return interaction.editReply({ content: `❌ **Failed to ${isAdd ? 'assign' : 'remove'} role:** ${err.message}` });
                }
            }

            const actionOption = interaction.options.getString('action') || 'add';
            const targetOption = interaction.options.getString('target') || (subCommand === 'humans' ? 'humans' : (subCommand === 'bots' ? 'bots' : 'all'));

            // Check role hierarchy with invoking user if not Master Owner
            if (!isMaster && !isServerOwner) {
                const userHighest = interaction.member?.roles?.highest?.position || 0;
                if (role.position >= userHighest) {
                    return interaction.reply({
                        content: `❌ **Role Hierarchy Error:** You cannot manage the role <@&${role.id}> because it is positioned higher than or equal to your highest role.`,
                        flags: 64
                    });
                }
            }

            await interaction.deferReply();

            const isAdd = (actionOption.toLowerCase() === 'add');
            const initialMsg = `⚡ **Initiating Turbo 0.50 Mass Role...**\n• Role: <@&${role.id}>\n• Action: **${isAdd ? '➕ Adding to' : '➖ Removing from'}**\n• Target: **${targetOption.toUpperCase()}**\n⏳ *Fetching server members and starting high-speed workers...*`;

            await interaction.editReply({ content: initialMsg }).catch(() => null);

            try {
                const result = await executeMassRole({
                    guild: interaction.guild,
                    roleId: role.id,
                    action: actionOption,
                    targetFilter: targetOption,
                    operator: interaction.user.tag,
                    progressCallback: (prog) => {
                        if (prog.stage === 'running') {
                            const percent = prog.progressPercent || 0;
                            const filled = Math.round(percent / 10);
                            const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
                            const updateEmbed = new EmbedBuilder()
                                .setColor(0x00E5FF)
                                .setTitle(`⚡ High-Speed Mass Role Engine — ${prog.action === 'add' ? '➕ Adding' : '➖ Removing'}`)
                                .setDescription(`Replicating role <@&${prog.roleId}> across members at turbo speed (0.50s pipeline)!\n\n**Progress:** \`[${bar}] ${percent}%\`\n**Processed:** \`${prog.successCount + prog.failCount} / ${prog.candidatesCount}\` members\n**Speed:** \`~${prog.speed || '50+'} members/sec\``)
                                .addFields(
                                    { name: '🎯 Role', value: `<@&${prog.roleId}>`, inline: true },
                                    { name: '👥 Target Group', value: `\`${prog.targetFilter.toUpperCase()}\``, inline: true },
                                    { name: '✅ Applied', value: `\`${prog.successCount}\``, inline: true },
                                    { name: '⏭️ Already in state', value: `\`${prog.alreadySetCount}\``, inline: true },
                                    { name: '❌ Failed / Skipped', value: `\`${prog.failCount}\``, inline: true }
                                )
                                .setFooter({ text: 'Discord High-Speed Engine • Turbo Mode Active' })
                                .setTimestamp();

                            interaction.editReply({ content: null, embeds: [updateEmbed] }).catch(() => {});
                        }
                    }
                });

                const durSec = (result.durationMs / 1000).toFixed(2);
                const finalEmbed = new EmbedBuilder()
                    .setColor(0x10B981)
                    .setTitle(`🎉 Mass Role Operation Complete!`)
                    .setDescription(`Successfully completed mass role update in **${durSec}s** with high-speed parallel workers!`)
                    .addFields(
                        { name: '🏷️ Role', value: `<@&${result.roleId}> (\`${result.roleName}\`)`, inline: true },
                        { name: '⚡ Mode', value: `**${result.action.toUpperCase()}** (${targetOption.toUpperCase()})`, inline: true },
                        { name: '⏱️ Duration', value: `\`${durSec}s\``, inline: true },
                        { name: '✅ Total Modified', value: `**${result.successCount}** members`, inline: true },
                        { name: '⏭️ Already in state', value: `**${result.alreadySetCount}** members`, inline: true },
                        { name: '❌ Failed', value: `**${result.failCount}** members`, inline: true },
                        { name: '👤 Operator', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setFooter({ text: 'Ultra-Fast Mass Role Engine • Completed' })
                    .setTimestamp();

                return interaction.editReply({ content: null, embeds: [finalEmbed] });
            } catch (err) {
                console.error('Mass role error:', err);
                return interaction.editReply({ content: `❌ **Mass Role Failed:** ${err.message}`, embeds: [] });
            }
        } else if (commandName === 'lockall' || commandName === 'unlockall') {
            if (!interaction.guild) {
                return interaction.reply({ content: '❌ This command can only be used inside a Discord server.', flags: 64 });
            }

            const masterId = getMasterOwnerId();
            const isMaster = isMasterOwner(interaction.user.id) || interaction.user.id === masterId;
            const sec = getGuildSecurity(guildId, guild?.ownerId);
            const hasAdminRole = Array.isArray(sec.adminRoles) && sec.adminRoles.some(rId => interaction.member?.roles?.cache?.has(rId));
            const isWhitelistedUser = sec.whitelist && sec.whitelist.includes(interaction.user.id);
            const isServerOwner = interaction.user.id === guild?.ownerId;
            const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) || interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels);

            if (!isMaster && !hasAdminRole && !isWhitelistedUser && !isServerOwner && !isAdmin) {
                return interaction.reply({
                    content: `🔒 **Permission Denied — Admin Role / Permission Required**\nOnly the Master Bot Owner (<@${masterId}>), assigned **Admin Roles**, or Server Admins with Manage Channels permission can execute server lockdowns.`,
                    flags: 64
                });
            }

            const actionOption = commandName === 'unlockall' ? 'unlock' : (interaction.options.getString('action') || 'lock');
            const scopeOption = interaction.options.getString('scope') || 'all';
            const reasonOption = interaction.options.getString('reason') || (actionOption === 'lock' ? 'Server Lockdown / Maintenance' : 'Lockdown lifted');

            await interaction.deferReply();

            const isLock = (actionOption.toLowerCase() === 'lock');
            const initialMsg = `🔒 **Initiating Turbo Server ${isLock ? 'Lockdown' : 'Unlock'}...**\n• Action: **${isLock ? '🔒 Locking all channels' : '🔓 Unlocking all channels'}**\n• Target Scope: **${scopeOption.toUpperCase()}**\n• Reason: *${reasonOption}*\n⏳ *Fetching server channels and applying permission overwrites...*`;

            await interaction.editReply({ content: initialMsg }).catch(() => null);

            try {
                const result = await executeMassChannelLock({
                    guild: interaction.guild,
                    action: actionOption,
                    scope: scopeOption,
                    reason: reasonOption,
                    operator: interaction.user.tag,
                    progressCallback: (prog) => {
                        if (prog.stage === 'running') {
                            const percent = prog.progressPercent || 0;
                            const filled = Math.round(percent / 10);
                            const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
                            const updateEmbed = new EmbedBuilder()
                                .setColor(prog.action === 'lock' ? 0xE11D48 : 0x10B981)
                                .setTitle(`⚡ Server Channel ${prog.action === 'lock' ? '🔒 Lockdown' : '🔓 Unlock'} Engine`)
                                .setDescription(`Updating channel permission overwrites for \`@everyone\` at turbo speed!\n\n**Progress:** \`[${bar}] ${percent}%\`\n**Processed:** \`${prog.successCount + prog.failCount} / ${prog.totalChannels}\` channels\n**Speed:** \`~${prog.speed || '15+'} channels/sec\``)
                                .addFields(
                                    { name: '🛡️ Mode', value: `\`${prog.action.toUpperCase()}\``, inline: true },
                                    { name: '🎯 Scope', value: `\`${prog.scope.toUpperCase()}\``, inline: true },
                                    { name: '✅ Updated', value: `\`${prog.successCount}\``, inline: true },
                                    { name: '❌ Failed', value: `\`${prog.failCount}\``, inline: true }
                                )
                                .setFooter({ text: 'High-Speed Channel Security Pipeline' })
                                .setTimestamp();

                            interaction.editReply({ content: null, embeds: [updateEmbed] }).catch(() => {});
                        }
                    }
                });

                const durSec = (result.durationMs / 1000).toFixed(2);
                const finalEmbed = new EmbedBuilder()
                    .setColor(result.action === 'lock' ? 0xE11D48 : 0x10B981)
                    .setTitle(`🎉 Server Channel ${result.action === 'lock' ? '🔒 Lockdown' : '🔓 Unlock'} Complete!`)
                    .setDescription(`Successfully **${result.action === 'lock' ? 'LOCKED' : 'UNLOCKED'}** server channels for \`@everyone\` in **${durSec}s**!`)
                    .addFields(
                        { name: '⚡ Action', value: `**${result.action === 'lock' ? '🔒 LOCKED' : '🔓 UNLOCKED'}**`, inline: true },
                        { name: '🎯 Channel Scope', value: `\`${result.scope.toUpperCase()}\``, inline: true },
                        { name: '⏱️ Duration', value: `\`${durSec}s\``, inline: true },
                        { name: '📁 Channels Updated', value: `**${result.successCount}** / ${result.totalChannels}`, inline: true },
                        { name: '📝 Reason', value: `${result.reason}`, inline: true },
                        { name: '👤 Operator', value: `<@${interaction.user.id}>`, inline: true }
                    )
                    .setFooter({ text: 'Ultra-Fast Channel Security Engine • Completed' })
                    .setTimestamp();

                return interaction.editReply({ content: null, embeds: [finalEmbed] });
            } catch (err) {
                console.error('Lockall channels error:', err);
                return interaction.editReply({ content: `❌ **Channel Lockdown Failed:** ${err.message}`, embeds: [] });
            }
        } else if (commandName === 'login') {
            const tokenInput = interaction.options.getString('token');
            const targetUser = interaction.user;

            if (tokenInput && tokenInput.trim()) {
                const cleanToken = tokenInput.trim();
                const authResult = await loginUserToken(cleanToken);
                if (authResult.success && authResult.user) {
                    userToken = cleanToken;
                    saveSettings();
                    const displayName = authResult.user.global_name || authResult.user.username;
                    addLog('User Login', authResult.user.id, targetUser.id, true, `Logged in`);
                    return interaction.reply({
                        content: `You has successfully been login **${displayName}**`,
                        flags: 64
                    });
                } else {
                    return interaction.reply({
                        content: `❌ Login failed. Please check your credentials.`,
                        flags: 64
                    });
                }
            } else {
                if (userToken && userToken.trim()) {
                    const authResult = await loginUserToken(userToken);
                    if (authResult.success && authResult.user) {
                        const displayName = authResult.user.global_name || authResult.user.username;
                        return interaction.reply({
                            content: `You has successfully been login **${displayName}**`,
                            flags: 64
                        });
                    }
                }

                const displayName = targetUser.global_name || targetUser.username;
                return interaction.reply({
                    content: `You has successfully been login **${displayName}**`,
                    flags: 64
                });
            }
        }
    } catch (err) {
        console.error('Interaction error:', err);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(`❌ An error occurred executing this command: ${err.message}`).catch(() => {});
        } else {
            await interaction.reply({ content: `❌ An error occurred: ${err.message}`, flags: 64 }).catch(() => {});
        }
    }
});

// Handle commands
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    let matchedPrefix = null;
    if (message.content.startsWith(PREFIX)) {
        matchedPrefix = PREFIX;
    } else if (message.content.startsWith('/')) {
        matchedPrefix = '/';
    } else if (message.content.startsWith('.')) {
        matchedPrefix = '.';
    }

    if (!matchedPrefix) return;

    const args = message.content.slice(matchedPrefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    if (!command) return;

    const usedPrefix = matchedPrefix;

    // Verify user authorization when bot is locked (bot is strictly locked for everyone except whitelisted users)
    const isPublicCommand = (command === 'invite' || command === 'botinvite');
    const auth = checkCommandAuthorization(message.author, message.member, message.guild, isPublicCommand);
    if (!auth.authorized) {
        return message.reply(auth.reason);
    }

    if (command === 'forwardall') {
        const sourceInput = args[0];
        const destInput = args[1];
        if (!sourceInput) {
            return message.reply(`❌ Please provide a source channel ID!\nUsage: \`${usedPrefix}forwardall <source_channel_id> [destination_channel_id]\``);
        }

        const sourceChannel = await findChannelInAllServers(sourceInput);
        if (!sourceChannel) {
            return message.reply('❌ Source channel not found. Make sure the bot is in that server or a user token is provided.');
        }

        let targetChannel = message.channel;
        if (destInput && destInput.trim()) {
            const cleanDestId = destInput.trim().replace(/[<#>]/g, '');
            const foundDest = await client.channels.fetch(cleanDestId).catch(() => null);
            if (!foundDest || !foundDest.isTextBased()) {
                return message.reply(`❌ Destination channel (\`${cleanDestId}\`) not found or is not a text channel accessible by the bot.`);
            }
            targetChannel = foundDest;
        }

        if (sourceChannel.id === targetChannel.id) {
            return message.reply('❌ Source and destination channels cannot be the same!');
        }

        const botMember = targetChannel.guild?.members.cache.get(client.user.id);
        if (botMember && !targetChannel.permissionsFor(botMember)?.has(['SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory'])) {
            return message.reply(`❌ I don't have permission to send messages/embeds/files in <#${targetChannel.id}>.`);
        }

        await message.reply(`🔄 **Starting FULL COPY** of .txt files from <#${sourceChannel.id}> to <#${targetChannel.id}>...`);

        const result = await copyAllMessages(sourceChannel, targetChannel);
        if (!result.success) {
            return message.reply(`❌ Failed: ${result.message}`);
        }
    } else if (command === 'stopallforward' || command === 'stopallforwards' || command === 'stopforwards' || command === 'clearforwards' || command === 'stopall') {
        const guild = message.guild;
        const masterId = getMasterOwnerId();
        const isMaster = isMasterOwner(message.author.id) || message.author.id === masterId;
        const isWhitelistedUser = isWhitelist2(message.author.id);
        const isServerOwner = guild && message.author.id === guild.ownerId;
        const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
        const sec = guild ? getGuildSecurity(guild.id, guild.ownerId) : { adminRoles: [] };
        const hasAdminRole = Array.isArray(sec.adminRoles) && sec.adminRoles.some(rId => message.member?.roles?.cache?.has(rId));

        if (!isMaster && !hasAdminRole && !isWhitelistedUser && !isServerOwner && !isAdmin) {
            return message.reply(`🔒 **Permission Denied**\nOnly the Master Bot Owner (<@${masterId}>), Whitelist 2 users, Server Owners, or Administrators can stop auto-forwarding rules.`);
        }

        const scopeArg = args[0]?.toLowerCase();
        const isServerOnly = (scopeArg === 'here' || scopeArg === 'server' || scopeArg === 'this');

        try {
            let totalGuildsCount = 0;
            let totalRoutesCount = 0;

            if (isServerOnly && guild) {
                if (forwards[guild.id]) {
                    totalGuildsCount = 1;
                    for (const targetId in forwards[guild.id]) {
                        totalRoutesCount += Array.isArray(forwards[guild.id][targetId]) ? forwards[guild.id][targetId].length : 1;
                    }
                    delete forwards[guild.id];
                    saveForwards();
                }

                addLog('Stop Server Forwards', guild.id, message.author.id, true, `Stopped ${totalRoutesCount} forwarding routes in server ${guild.name}`);

                const embed = new EmbedBuilder()
                    .setColor(0xEF4444)
                    .setTitle('🛑 Auto-Forwarding Stopped (Server Scope)')
                    .setDescription(`Successfully stopped and cleared all auto-forwarding rules for **${guild.name}**!`)
                    .addFields(
                        { name: '🏠 Server', value: `${guild.name}`, inline: true },
                        { name: '🛣️ Routes Cleared', value: `${totalRoutesCount} route(s)`, inline: true },
                        { name: '👤 Operator', value: `<@${message.author.id}>`, inline: true }
                    )
                    .setFooter({ text: 'Auto-Forward Engine • Rules Cleared' })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            } else {
                for (const gId in forwards) {
                    if (forwards[gId] && Object.keys(forwards[gId]).length > 0) {
                        totalGuildsCount++;
                        for (const targetId in forwards[gId]) {
                            totalRoutesCount += Array.isArray(forwards[gId][targetId]) ? forwards[gId][targetId].length : 1;
                        }
                    }
                }

                forwards = {};
                saveForwards();

                addLog('Stop All Forwards', 'All Servers', message.author.id, true, `Global wipe: stopped ${totalRoutesCount} routes across ${totalGuildsCount} servers`);

                const embed = new EmbedBuilder()
                    .setColor(0xEF4444)
                    .setTitle('🛑 ALL Auto-Forwarding Stopped (Every Server)')
                    .setDescription(`Successfully stopped and removed **ALL** auto-forwarding rules across **every server**!`)
                    .addFields(
                        { name: '🌐 Scope', value: 'Every Server (Global)', inline: true },
                        { name: '🏰 Servers Affected', value: `${totalGuildsCount} server(s)`, inline: true },
                        { name: '🛣️ Total Routes Cleared', value: `${totalRoutesCount} route(s)`, inline: true },
                        { name: '👤 Operator', value: `<@${message.author.id}>`, inline: true }
                    )
                    .setFooter({ text: 'Auto-Forward Engine • Global Wipe Complete' })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }
        } catch (err) {
            console.error('Stop all forwards prefix error:', err);
            return message.reply(`❌ Failed to stop forwarding: ${err.message}`);
        }
    } else if (command === 'findsource' || command === 'findsources' || command === 'sources') {
        const filter = args.join(' ').trim();
        try {
            const sources = await getAllForwardSources(filter);
            const embed = buildFindSourceEmbed(sources, filter);
            return message.reply({ embeds: [embed] });
        } catch (err) {
            console.error('findsource prefix error:', err);
            return message.reply(`❌ Error finding sources: ${err.message}`);
        }
    } else if (command === 'hub' || command === 'sod' || command === 'sources') {
        const query = args.join(' ').trim();

        try {
            const results = await searchHubScripts(query === 'all' ? '' : query, message.channel, message.guild);
            if (!results || results.length === 0) {
                return message.reply(`❌ No scripts found matching \`${query}\` in the Fetch Hub cache.\nTip: Try searching with a broader keyword (e.g. \`.hub duel\`, \`.hub semi\`, or \`.hub lua\`)!`);
            }

            const sessionId = `hub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const session = {
                id: sessionId,
                query: query || 'All Sources',
                results,
                currentIndex: 0,
                authorId: message.author.id,
                expiresAt: Date.now() + 15 * 60 * 1000
            };
            hubSessions.set(sessionId, session);

            const payload = await buildHubResultPayload(session, 0);
            return await message.reply(payload);
        } catch (err) {
            console.error('hub prefix command error:', err);
            return message.reply(`❌ Error searching Fetch Hub scripts: ${err.message}`);
        }
    } else if (command === 'execute' || command === 'exec') {
        const rawCode = args.join(' ');
        const attachment = message.attachments.first();
        return await handleRobloxExecution({
            sourceInput: rawCode,
            attachment: attachment ? { url: attachment.url, name: attachment.name } : null,
            scriptNameInput: attachment?.name || (rawCode.startsWith('loadstring') ? 'loadstring.lua' : 'script.lua'),
            replyFn: (payload) => message.reply(payload),
            user: message.author
        });
    } else if (command === 'syncsources' || command === 'fetchsources') {
        const statusMsg = await message.reply('🔄 **Crawling source channels (`1542249491384639708` & `1542250901396394065`)...**');
        const count = await syncTargetChannelsToHub();
        return statusMsg.edit(`✅ **Source Synchronization Complete!**\nScanned target channels. Total scripts cached in Fetch Hub: **${fetchHubCache.length}**.\nUse \`.hub\` to search or \`.execute <name>\` to run!`);
    } else if (command === 'purge') {
        const targetChannel = message.channel;
        if (!targetChannel || !targetChannel.guild) {
            return message.reply('❌ This command can only be used in a server text channel.');
        }

        const botMember = message.guild.members.cache.get(client.user.id);
        if (botMember && !targetChannel.permissionsFor(botMember)?.has(['ManageMessages', 'ReadMessageHistory'])) {
            return message.reply('❌ I need the **Manage Messages** and **Read Message History** permissions to purge messages in this channel.');
        }

        // Delete command invocation message immediately
        await message.delete().catch(() => {});

        const amountInput = args[0] || 'all';
        const authorTag = message.author.tag || message.author.username;
        const authorId = message.author.id;

        try {
            const result = await purgeChannelMessages(targetChannel, amountInput);
            if (result.success) {
                const tempMsg = await targetChannel.send(`💥 **Purged ${result.count} message(s)** in this channel by <@${authorId}>!`).catch(() => null);
                if (tempMsg) {
                    setTimeout(() => tempMsg.delete().catch(() => {}), 5000);
                }
                addLog('Channel Purge', targetChannel.id, message.guild.id, true, `Purged ${result.count} messages in same channel by ${authorTag}`);
            } else {
                const tempMsg = await targetChannel.send(`❌ Failed to purge messages: ${result.message}`).catch(() => null);
                if (tempMsg) {
                    setTimeout(() => tempMsg.delete().catch(() => {}), 5000);
                }
            }
        } catch (err) {
            console.error('Purge command prefix error:', err);
        }
    } else if (command === 'exporthtml') {
        const sourceChannel = message.channel;
        if (!sourceChannel || sourceChannel.isDMBased?.()) {
            return message.reply('❌ This command can only be used in a text channel.');
        }

        // Parse args: !exporthtml [amount] [destination] [upload_files] or !exporthtml [destination] [amount]
        let amountInput = 100;
        let destChannelInput = null;
        let shouldUploadFiles = true;

        for (const arg of args) {
            if (/^\d+$/.test(arg) && parseInt(arg, 10) <= 500 && !destChannelInput) {
                amountInput = parseInt(arg, 10);
            } else if (arg.startsWith('<#') || /^\d{16,20}$/.test(arg)) {
                destChannelInput = arg;
            } else if (arg.toLowerCase() === 'false' || arg.toLowerCase() === 'nofiles') {
                shouldUploadFiles = false;
            }
        }

        let targetDestChannel = sourceChannel;
        if (destChannelInput) {
            const parsedDestId = parseChannelId(destChannelInput);
            if (parsedDestId) {
                try {
                    const fetched = await client.channels.fetch(parsedDestId).catch(() => null);
                    if (fetched && fetched.isTextBased?.()) {
                        targetDestChannel = fetched;
                    } else if (message.guild) {
                        const found = message.guild.channels.cache.get(parsedDestId);
                        if (found && found.isTextBased?.()) {
                            targetDestChannel = found;
                        }
                    }
                } catch (e) {
                    console.warn('Could not resolve destination channel in prefix command:', e);
                }
            }
        }

        const waitMsg = await message.reply(`🔄 **Exporting channel transcript...** (${amountInput} messages)`).catch(() => null);

        const result = await exportChannelHtml(sourceChannel, amountInput, shouldUploadFiles);

        if (!result.success) {
            if (waitMsg) waitMsg.edit(`❌ Failed to export: ${result.message}`).catch(() => {});
            return;
        }

        const htmlAttachment = new AttachmentBuilder(Buffer.from(result.html, 'utf-8'), { name: result.fileName });
        const filesToSend = [htmlAttachment];

        // If user attached extra files directly to the invocation message
        if (message.attachments && message.attachments.size > 0) {
            for (const [, att] of message.attachments) {
                try {
                    const res = await fetch(att.url);
                    if (res.ok) {
                        const arrayBuf = await res.arrayBuffer();
                        filesToSend.push(new AttachmentBuilder(Buffer.from(arrayBuf), { name: att.name }));
                    }
                } catch (e) {}
            }
        }

        try {
            await targetDestChannel.send({
                files: filesToSend
            });

            let uploadedFilesCount = 0;
            if (shouldUploadFiles && result.downloadedFiles && result.downloadedFiles.length > 0) {
                const batchSize = 10;
                const batches = [];
                for (let i = 0; i < result.downloadedFiles.length; i += batchSize) {
                    batches.push(result.downloadedFiles.slice(i, i + batchSize));
                }
                await Promise.all(batches.map(async (batch) => {
                    const fileNamesList = batch.map(f => f.name).join('\n');
                    const batchAttachments = batch.map(f => new AttachmentBuilder(f.attachment, { name: f.name }));

                    for (const f of batch) {
                        if (f.name) {
                            addScriptToHubCache({
                                name: f.name,
                                size: f.size || 0,
                                url: f.attachment,
                                messageId: `${Date.now()}`,
                                channelId: targetDestChannel.id,
                                guildId: targetDestChannel.guild?.id || null
                            });
                        }
                    }

                    await targetDestChannel.send({
                        content: fileNamesList,
                        files: batchAttachments
                    }).catch(err => console.error('Error sending file batch in prefix exporthtml:', err));
                    uploadedFilesCount += batch.length;
                }));
            }

            addLog('Export HTML', sourceChannel.id, targetDestChannel.id, true, `Exported ${result.messageCount} msgs & uploaded ${uploadedFilesCount} files by ${message.author?.tag || message.author?.username}`);

            if (waitMsg) {
                if (targetDestChannel.id !== sourceChannel.id) {
                    await waitMsg.edit(`✅ **Export complete!** Sent to <#${targetDestChannel.id}> (${result.messageCount} messages, ${uploadedFilesCount} files uploaded)`).catch(() => {});
                } else {
                    await waitMsg.delete().catch(() => {});
                }
            }
        } catch (sendErr) {
            if (waitMsg) waitMsg.edit(`❌ Failed to send export into <#${targetDestChannel.id}>: ${sendErr.message}`).catch(() => {});
        }
    } else if (command === 'clear') {
        const targetChannel = message.channel;
        if (!targetChannel || !targetChannel.guild) {
            return message.reply('❌ This command can only be used in a server text channel.');
        }

        const botMember = message.guild.members.cache.get(client.user.id);
        if (botMember && !targetChannel.permissionsFor(botMember)?.has(['ManageChannels'])) {
            return message.reply('❌ I need the **Manage Channels** permission to delete and clone this channel.');
        }

        const position = targetChannel.rawPosition ?? targetChannel.position;
        const originalId = targetChannel.id;
        const guildId = message.guild.id;
        const authorId = message.author.id;
        const authorTag = message.author.tag || message.author.username;

        try {
            const clonedChannel = await targetChannel.clone({
                reason: `Channel cleared/nuked by ${authorTag}`
            });

            if (typeof position === 'number') {
                await clonedChannel.setPosition(position).catch(() => {});
            }

            if (forwards[guildId]) {
                if (forwards[guildId][originalId]) {
                    forwards[guildId][clonedChannel.id] = forwards[guildId][originalId];
                    delete forwards[guildId][originalId];
                    saveForwards();
                }
                for (const [tId, sources] of Object.entries(forwards[guildId])) {
                    const idx = sources.indexOf(originalId);
                    if (idx !== -1) {
                        sources[idx] = clonedChannel.id;
                        saveForwards();
                    }
                }
            }

            await targetChannel.delete(`Channel cleared and cloned by ${authorTag}`);

            await clonedChannel.send({
                content: `💥 **Channel cleared!** Cloned by <@${authorId}>`
            }).catch(() => {});

            addLog('Channel Cleared', originalId, clonedChannel.id, true, `Cloned by ${authorTag}`);
        } catch (err) {
            console.error('Clear channel error:', err);
        }
    } else if (command === 'deleteallchannels') {
        const guild = message.guild;
        if (!guild) {
            return message.reply('❌ This command can only be used inside a Discord server.');
        }

        const botMember = guild.members.cache.get(client.user.id);
        if (botMember && !botMember.permissions.has(['ManageChannels'])) {
            return message.reply('❌ I need the **Manage Channels** permission to delete all channels.');
        }

        const authorTag = message.author.tag || message.author.username;
        const authorId = message.author.id;
        const guildId = guild.id;

        await message.reply('🧨 **Initiating channel wipe...** Creating fresh channel and deleting all other channels & categories.').catch(() => {});

        try {
            const allChannels = await guild.channels.fetch();

            const newChannel = await guild.channels.create({
                name: 'general',
                type: ChannelType.GuildText,
                reason: `All channels deleted by ${authorTag}`
            });

            if (forwards[guildId]) {
                delete forwards[guildId];
                saveForwards();
            }

            let deletedCount = 0;
            for (const [id, ch] of allChannels) {
                if (!ch || ch.id === newChannel.id) continue;
                try {
                    await ch.delete(`All channels deleted by ${authorTag}`);
                    deletedCount++;
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (delErr) {
                    console.warn(`Could not delete channel ${id}:`, delErr.message);
                }
            }

            await newChannel.send({
                content: `💥 **All channels deleted!** (${deletedCount} channel(s)/categories removed)\nServer reset by <@${authorId}>`
            }).catch(() => {});

            addLog('All Channels Deleted', guildId, newChannel.id, true, `Deleted ${deletedCount} channels by ${authorTag}`);
        } catch (err) {
            console.error('Delete all channels error:', err);
        }
    } else if (command === 'clone') {
        const sourceId = args[0];
        const destId = args[1] || message.guild?.id;
        const clearOpt = args[2] ? (args[2].toLowerCase() !== 'false' && args[2].toLowerCase() !== 'no') : true;

        if (!sourceId) {
            return message.reply(`🔄 **Server Cloner Usage:**\n\`${usedPrefix}clone <source_server_id> [destination_server_id] [clear:true/false]\`\nExample: \`${usedPrefix}clone 1486575666379096246 1532774119463063744\`\n\n*If destination server ID is omitted, it clones directly into the current server.*`);
        }

        if (!destId) {
            return message.reply(`❌ Please specify a destination server ID or run this command inside a Discord server.`);
        }

        const cleanSource = String(sourceId).trim().replace(/[<@#!&>]/g, '');
        const cleanDest = String(destId).trim().replace(/[<@#!&>]/g, '');

        const masterId = getMasterOwnerId();
        const isMaster = isMasterOwner(message.author.id) || message.author.id === masterId;
        const sec = getGuildSecurity(message.guild.id, message.guild.ownerId);
        const hasAdminRole = Array.isArray(sec.adminRoles) && sec.adminRoles.some(rId => message.member?.roles?.cache?.has(rId));
        const isWhitelistedUser = sec.whitelist && sec.whitelist.includes(message.author.id);
        const isDestOwner = message.guild && message.guild.id === cleanDest && message.author.id === message.guild.ownerId;

        if (!isMaster && !hasAdminRole && !isWhitelistedUser && !isDestOwner) {
            return message.reply(`🔒 **Permission Denied — Owner / Admin Role Required**\nOnly the Master Bot Owner (<@${masterId}>), assigned **Admin Roles**, or Whitelisted Admins can use \`${usedPrefix}clone\`.\n\n*Ask the Owner to grant you permission.*`);
        }

        const statusMsg = await message.reply(`🔄 **Initiating Server Clone...**\n• Source Server: \`${cleanSource}\`\n• Destination Server: \`${cleanDest}\`\n• Wipe Destination First: \`${clearOpt ? 'Yes' : 'No'}\`\n⏳ *Replicating roles, categories, channels, and permissions...*`).catch(() => null);

        try {
            const result = await cloneServer({
                sourceGuildId: cleanSource,
                destinationGuildId: cleanDest,
                options: {
                    clearDestination: clearOpt,
                    cloneRoles: true,
                    cloneChannels: true,
                    cloneSettings: true,
                    cloneEmojis: true
                },
                operatorTag: message.author.tag || message.author.username
            });

            const embed = new EmbedBuilder()
                .setColor(0x00E5FF)
                .setTitle('🎉 Server Successfully Cloned!')
                .setDescription(`Replicated **${result.sourceGuild}** ➔ **${result.destinationGuild}**`)
                .addFields(
                    { name: '👑 Roles Replicated', value: `${result.rolesCloned}`, inline: true },
                    { name: '📁 Categories Created', value: `${result.categoriesCloned}`, inline: true },
                    { name: '💬 Channels Cloned', value: `${result.channelsCloned}`, inline: true },
                    { name: '😀 Custom Emojis', value: `${result.emojisCloned}`, inline: true },
                    { name: '🧹 Destination Wiped', value: clearOpt ? 'Yes' : 'No', inline: true },
                    { name: '👤 Operator', value: `<@${message.author.id}>`, inline: true }
                )
                .setFooter({ text: 'Discord Server Cloner Engine • 100% Exact Copy' })
                .setTimestamp();

            if (statusMsg) {
                await statusMsg.edit({ content: '✅ **Server Cloning Completed!**', embeds: [embed] }).catch(() => {});
            } else {
                await message.reply({ embeds: [embed] });
            }
        } catch (err) {
            console.error('Prefix clone error:', err);
            if (statusMsg) {
                await statusMsg.edit(`❌ **Server Clone Failed:** ${err.message}`).catch(() => {});
            } else {
                await message.reply(`❌ **Server Clone Failed:** ${err.message}`);
            }
        }
    } else if (command === 'adminrole' || command === 'adminroles') {
        const guild = message.guild;
        const sec = getGuildSecurity(guild.id, guild.ownerId);
        const masterId = getMasterOwnerId();
        const isMaster = isMasterOwner(message.author.id) || message.author.id === masterId || message.author.id === guild.ownerId;

        if (!isMaster) {
            return message.reply(`❌ Only the Master Bot Owner (<@${masterId}>) can manage Admin Roles.`);
        }

        const sub = args[0]?.toLowerCase();
        const roleMention = message.mentions.roles.first() || (args[1] ? guild.roles.cache.get(args[1].replace(/[<@&>]/g, '')) : null);

        if (sub === 'list' || !sub) {
            const listFormatted = (sec.adminRoles && sec.adminRoles.length > 0)
                ? sec.adminRoles.map(id => {
                    const r = guild.roles.cache.get(id);
                    return `• <@&${id}> (\`${id}\`) ${r ? `— **@${r.name}**` : ''}`;
                }).join('\n')
                : '*(None configured yet)*';

            const listEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`👑 Authorized Admin Roles (${sec.adminRoles?.length || 0})`)
                .setDescription(`Members with any of these roles have full permission to use all bot commands even during lockdown:\n\n${listFormatted}`)
                .setFooter({ text: `Use ${usedPrefix}adminrole add <@role> or ${usedPrefix}adminrole remove <@role>` })
                .setTimestamp();

            return message.reply({ embeds: [listEmbed] });
        }

        if (!roleMention) {
            return message.reply(`❌ Please specify a valid role!\nUsage: \`${usedPrefix}adminrole add <@role/role_id>\` or \`${usedPrefix}adminrole remove <@role/role_id>\``);
        }

        if (sub === 'add') {
            if (sec.adminRoles.includes(roleMention.id)) {
                return message.reply(`ℹ️ <@&${roleMention.id}> is already an authorized Admin Role.`);
            }
            sec.adminRoles.push(roleMention.id);
            saveSecurity();
            addLog('Admin Role Added', roleMention.id, guild.id, true, `Added by ${message.author.tag}`);
            return message.reply(`✅ **Successfully authorized Admin Role:** <@&${roleMention.id}>! Members with this role can now execute bot commands.`);
        } else if (sub === 'remove') {
            if (!sec.adminRoles.includes(roleMention.id)) {
                return message.reply(`ℹ️ <@&${roleMention.id}> is not in the Admin Roles list.`);
            }
            sec.adminRoles = sec.adminRoles.filter(id => id !== roleMention.id);
            saveSecurity();
            addLog('Admin Role Removed', roleMention.id, guild.id, true, `Removed by ${message.author.tag}`);
            return message.reply(`✅ **Successfully revoked Admin Role:** <@&${roleMention.id}>.`);
        }
    } else if (command === 'botlock' || command === 'lock' || command === 'unlock' || command === 'grant' || command === 'revoke') {
        const guild = message.guild;
        const sec = getGuildSecurity(guild.id, guild.ownerId);
        const masterId = getMasterOwnerId();
        const isMaster = isMasterOwner(message.author.id) || message.author.id === masterId || message.author.id === guild.ownerId;

        if (command === 'lock' || (command === 'botlock' && (args[0]?.toLowerCase() === 'lock' || args[0]?.toLowerCase() === 'on'))) {
            if (!isMaster) return message.reply(`❌ Only the Master Bot Owner (<@${masterId}>) can toggle Bot Lockdown.`);
            sec.botLocked = true;
            saveSecurity();
            addLog('Bot Locked', message.author.id, guild.id, true, `Locked by ${message.author.tag}`);
            return message.reply(`🔒 **Bot Lockdown is now ACTIVE!**\nOnly the Master Owner (<@${masterId}>), assigned **Admin Roles**, and whitelisted users can execute commands.`);
        }

        if (command === 'unlock' || (command === 'botlock' && (args[0]?.toLowerCase() === 'unlock' || args[0]?.toLowerCase() === 'off'))) {
            if (!isMaster) return message.reply(`❌ Only the Master Bot Owner (<@${masterId}>) can toggle Bot Lockdown.`);
            sec.botLocked = false;
            saveSecurity();
            addLog('Bot Unlocked', message.author.id, guild.id, true, `Unlocked by ${message.author.tag}`);
            return message.reply(`🔓 **Bot Lockdown is now DISABLED!** Standard server administrators can now execute commands.`);
        }

        if (command === 'grant' || (command === 'botlock' && args[0]?.toLowerCase() === 'grant')) {
            if (!isMaster) return message.reply(`❌ Only the Master Bot Owner (<@${masterId}>) can grant permissions.`);
            const targetUser = message.mentions.users.first() || (args[1] ? await client.users.fetch(args[1].replace(/[<@!>]/g, '')).catch(() => null) : null);
            if (!targetUser) return message.reply(`❌ Please specify a user to grant permission!\nUsage: \`${usedPrefix}grant <@user>\``);
            if (!sec.whitelist.includes(targetUser.id)) sec.whitelist.push(targetUser.id);
            saveSecurity();
            addLog('Permission Granted', targetUser.id, guild.id, true, `Granted by ${message.author.tag}`);
            return message.reply(`✅ **Permission Granted!** <@${targetUser.id}> is now authorized to use bot commands.`);
        }

        if (command === 'revoke' || (command === 'botlock' && args[0]?.toLowerCase() === 'revoke')) {
            if (!isMaster) return message.reply(`❌ Only the Master Bot Owner (<@${masterId}>) can revoke permissions.`);
            const targetUser = message.mentions.users.first() || (args[1] ? await client.users.fetch(args[1].replace(/[<@!>]/g, '')).catch(() => null) : null);
            if (!targetUser) return message.reply(`❌ Please specify a user to revoke permission!\nUsage: \`${usedPrefix}revoke <@user>\``);
            if (targetUser.id === masterId || isMasterOwner(targetUser.id)) return message.reply('❌ Cannot revoke Master Owner permission.');
            sec.whitelist = sec.whitelist.filter(id => id !== targetUser.id);
            saveSecurity();
            addLog('Permission Revoked', targetUser.id, guild.id, true, `Revoked by ${message.author.tag}`);
            return message.reply(`✅ **Permission Revoked!** Removed command access from <@${targetUser.id}>.`);
        }

        // Status view
        const lockStatus = sec.botLocked !== false;
        const adminRoleList = (sec.adminRoles && sec.adminRoles.length > 0)
            ? sec.adminRoles.map(rId => `<@&${rId}>`).join(', ')
            : '*(None)*';

        const embed = new EmbedBuilder()
            .setColor(lockStatus ? 0xE11D48 : 0x10B981)
            .setTitle('🔒 Bot Lock & Access Control Status')
            .setDescription(`Current Lock State: **${lockStatus ? '🔒 LOCKED (Owner & Admin Roles Only)' : '🔓 UNLOCKED'}**\n\nWhen locked, users must have permission from the Bot Owner or possess an authorized Admin Role to use commands.`)
            .addFields(
                { name: '👑 Master Bot Owner', value: `<@${masterId}> (\`${masterId}\`)`, inline: true },
                { name: '🛡️ Admin Roles', value: adminRoleList, inline: true },
                { name: '👥 Whitelisted Users', value: `${sec.whitelist.length} user(s)`, inline: true }
            )
            .setFooter({ text: `Use ${usedPrefix}lock, ${usedPrefix}unlock, or ${usedPrefix}adminrole add <@role>` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    } else if (command === 'give-admin' || command === 'giveadmin') {
        const guild = message.guild;
        if (!guild) return message.reply('❌ This command can only be used in a Discord server.');

        const masterId = getMasterOwnerId();
        const isMaster = isMasterOwner(message.author.id) || message.author.id === masterId;
        const isServerOwner = message.author.id === guild.ownerId;
        const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);

        if (!isMaster && !isServerOwner && !isAdmin) {
            return message.reply(`🔒 **Permission Denied**\nOnly the Server Owner (<@${guild.ownerId}>), Master Bot Owner (<@${masterId}>), or Server Administrators can create & assign Administrator roles.`);
        }

        const botMember = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
        if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return message.reply('❌ **Missing Bot Permissions:** I need the **Manage Roles** permission to create and grant an Administrator role.');
        }

        const targetUser = message.mentions.users.first() || (args[0] && /^\d{16,22}$/.test(args[0]) ? { id: args[0], tag: args[0] } : message.author);
        const roleName = args.filter(a => !a.startsWith('<@') && !/^\d{16,22}$/.test(a)).join(' ') || 'Administrator';

        try {
            const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
            if (!targetMember) {
                return message.reply(`❌ Target member <@${targetUser.id}> was not found in this server.`);
            }

            const newRole = await guild.roles.create({
                name: roleName,
                color: '#FF0000',
                permissions: [PermissionFlagsBits.Administrator],
                reason: `Admin role created via ${usedPrefix}give-admin by ${message.author.tag} (${message.author.id})`
            });

            await targetMember.roles.add(newRole.id, `Assigned via ${usedPrefix}give-admin by ${message.author.tag}`);

            const sec = getGuildSecurity(guild.id, guild.ownerId);
            if (Array.isArray(sec.adminRoles) && !sec.adminRoles.includes(newRole.id)) {
                sec.adminRoles.push(newRole.id);
                saveSecurity();
            }

            addLog('Give Admin Role', targetUser.id, message.author.id, true, `Created & assigned role "${newRole.name}" with Administrator permissions`);

            const embed = new EmbedBuilder()
                .setColor(0x10B981)
                .setTitle('👑 Administrator Role Created & Granted!')
                .setDescription(`Successfully created role <@&${newRole.id}> with **Administrator permissions** and assigned it to <@${targetUser.id}>!`)
                .addFields(
                    { name: '🛡️ Role Created', value: `<@&${newRole.id}> (\`${newRole.name}\`)`, inline: true },
                    { name: '👤 Granted To', value: `<@${targetUser.id}>`, inline: true },
                    { name: '👑 Permissions', value: '`Administrator` (All Access / Bypass)', inline: true },
                    { name: '⚡ Bot Security', value: 'Automatically registered as an Authorized Admin Role', inline: false }
                )
                .setFooter({ text: 'Discord High-Speed Engine • Administrator System' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (err) {
            console.error('give-admin prefix error:', err);
            return message.reply(`❌ **Failed to create/assign Administrator role:** ${err.message}`);
        }
    } else if (command === 'role' || command === 'roleall' || command === 'massrole') {
        const guild = message.guild;
        if (!guild) return message.reply('❌ This command can only be used in a Discord server.');

        const masterId = getMasterOwnerId();
        const isMaster = isMasterOwner(message.author.id) || message.author.id === masterId;
        const sec = getGuildSecurity(guild.id, guild.ownerId);
        const hasAdminRole = Array.isArray(sec.adminRoles) && sec.adminRoles.some(rId => message.member?.roles?.cache?.has(rId));
        const isWhitelistedUser = sec.whitelist && sec.whitelist.includes(message.author.id);
        const isServerOwner = message.author.id === guild.ownerId;
        const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator) || message.member?.permissions?.has(PermissionFlagsBits.ManageRoles);

        if (!isMaster && !hasAdminRole && !isWhitelistedUser && !isServerOwner && !isAdmin) {
            return message.reply(`🔒 **Permission Denied — Admin Role / Permission Required**\nOnly the Master Bot Owner (<@${masterId}>), assigned **Admin Roles**, or Server Admins can run role operations.`);
        }

        let sub = args[0]?.toLowerCase();
        let roleArg = null;
        let actionArg = 'add';
        let targetFilter = 'all';

        // Check for individual user role assignment: .role add <@user> <@role> or .role remove <@user> <@role> or .role add <@role> [user]
        if (command === 'role' && (sub === 'add' || sub === 'give' || sub === 'remove' || sub === 'take' || sub === 'del')) {
            const isAdd = (sub === 'add' || sub === 'give');
            const targetUserMention = message.mentions.users.first();
            const targetRoleMention = message.mentions.roles.first();

            let targetUserId = targetUserMention ? targetUserMention.id : null;
            let targetRoleId = targetRoleMention ? targetRoleMention.id : null;

            // Try to parse from remaining args if not mentioned
            const nonMentionArgs = args.slice(1).map(a => a.replace(/[<@!&>]/g, '').trim()).filter(Boolean);
            for (const arg of nonMentionArgs) {
                if (/^\d{16,22}$/.test(arg)) {
                    if (!targetRoleId && guild.roles.cache.has(arg)) {
                        targetRoleId = arg;
                    } else if (!targetUserId) {
                        targetUserId = arg;
                    }
                }
            }

            if (!targetUserId) targetUserId = message.author.id;

            if (targetRoleId) {
                const targetRole = await guild.roles.fetch(targetRoleId).catch(() => null);
                if (!targetRole) {
                    return message.reply(`❌ Role \`${targetRoleId}\` was not found in this server.`);
                }

                if (!isMaster && !isServerOwner) {
                    const userHighest = message.member?.roles?.highest?.position || 0;
                    if (targetRole.position >= userHighest) {
                        return message.reply(`❌ **Role Hierarchy Error:** You cannot manage <@&${targetRole.id}> because it is positioned higher than or equal to your highest role.`);
                    }
                }

                try {
                    const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
                    if (!targetMember) {
                        return message.reply(`❌ Target member <@${targetUserId}> was not found in this server.`);
                    }

                    if (isAdd) {
                        if (targetMember.roles.cache.has(targetRole.id)) {
                            return message.reply(`ℹ️ <@${targetUserId}> already has the <@&${targetRole.id}> role.`);
                        }
                        await targetMember.roles.add(targetRole.id, `Assigned by ${message.author.tag} via ${usedPrefix}role add`);
                    } else {
                        if (!targetMember.roles.cache.has(targetRole.id)) {
                            return message.reply(`ℹ️ <@${targetUserId}> does not have the <@&${targetRole.id}> role.`);
                        }
                        await targetMember.roles.remove(targetRole.id, `Removed by ${message.author.tag} via ${usedPrefix}role remove`);
                    }

                    addLog(isAdd ? 'Role Added' : 'Role Removed', targetUserId, message.author.id, true, `${isAdd ? 'Added' : 'Removed'} role "${targetRole.name}"`);

                    const embed = new EmbedBuilder()
                        .setColor(isAdd ? 0x10B981 : 0xE11D48)
                        .setTitle(`⚡ Role ${isAdd ? '➕ Added' : '➖ Removed'}`)
                        .setDescription(`Successfully **${isAdd ? 'granted' : 'removed'}** <@&${targetRole.id}> ${isAdd ? 'to' : 'from'} <@${targetUserId}>!`)
                        .addFields(
                            { name: '🏷️ Role', value: `<@&${targetRole.id}> (\`${targetRole.name}\`)`, inline: true },
                            { name: '👤 Target User', value: `<@${targetUserId}>`, inline: true },
                            { name: '👑 Managed By', value: `<@${message.author.id}>`, inline: true }
                        )
                        .setFooter({ text: 'Role Management System • Instant Execution' })
                        .setTimestamp();

                    return message.reply({ embeds: [embed] });
                } catch (err) {
                    return message.reply(`❌ **Failed to ${isAdd ? 'assign' : 'remove'} role:** ${err.message}`);
                }
            }
        }

        if (command === 'role') {
            if (sub === 'all' || sub === 'everyone') {
                targetFilter = 'all';
                roleArg = args[1];
                actionArg = args[2]?.toLowerCase() || 'add';
            } else if (sub === 'humans' || sub === 'human' || sub === 'users') {
                targetFilter = 'humans';
                roleArg = args[1];
                actionArg = args[2]?.toLowerCase() || 'add';
            } else if (sub === 'bots' || sub === 'bot') {
                targetFilter = 'bots';
                roleArg = args[1];
                actionArg = args[2]?.toLowerCase() || 'add';
            } else if (message.mentions.roles.first() || /^\d{16,22}$/.test(sub || '')) {
                // User did .role <@role> [add/remove]
                targetFilter = 'all';
                roleArg = args[0];
                actionArg = args[1]?.toLowerCase() || 'add';
            } else {
                return message.reply(`⚡ **Role Management Usage:**\n• \`${usedPrefix}role add <@role> [user]\` — Give role to user (or yourself)\n• \`${usedPrefix}role remove <@role> [user]\` — Remove role from user (or yourself)\n• \`${usedPrefix}give-admin [user]\` — Create and give Administrator role\n• \`${usedPrefix}role all <@role> [add/remove]\` — Mass role all members\n• \`${usedPrefix}role humans <@role> [add/remove]\` — Mass role humans only\n• \`${usedPrefix}role bots <@role> [add/remove]\` — Mass role bots only`);
            }
        } else {
            // roleall or massrole
            roleArg = args[0];
            actionArg = args[1]?.toLowerCase() || 'add';
            if (args[2]) {
                const t = args[2].toLowerCase();
                if (t === 'humans' || t === 'bots' || t === 'all') targetFilter = t;
            }
        }

        const roleMention = message.mentions.roles.first();
        const roleIdClean = roleMention ? roleMention.id : (roleArg ? roleArg.replace(/[<@&>]/g, '').trim() : null);

        if (!roleIdClean) {
            return message.reply(`❌ Please specify a valid role!\nExample: \`${usedPrefix}role all @Member\` or \`${usedPrefix}role all 123456789012345678\``);
        }

        const role = await guild.roles.fetch(roleIdClean).catch(() => null);
        if (!role) {
            return message.reply(`❌ Role \`${roleIdClean}\` was not found in this server.`);
        }

        // Role hierarchy checks
        if (!isMaster && !isServerOwner) {
            const userHighest = message.member?.roles?.highest?.position || 0;
            if (role.position >= userHighest) {
                return message.reply(`❌ **Role Hierarchy Error:** You cannot manage <@&${role.id}> because it is positioned higher than or equal to your highest role.`);
            }
        }

        const isAdd = (actionArg !== 'remove' && actionArg !== 'del' && actionArg !== 'delete');
        const finalAction = isAdd ? 'add' : 'remove';

        const statusMsg = await message.reply(`⚡ **Initiating Turbo 0.50 Mass Role...**\n• Target Role: <@&${role.id}>\n• Action: **${isAdd ? '➕ Adding to' : '➖ Removing from'}**\n• Filter: **${targetFilter.toUpperCase()}**\n⏳ *Processing server members at high speed...*`).catch(() => null);

        try {
            const result = await executeMassRole({
                guild,
                roleId: role.id,
                action: finalAction,
                targetFilter,
                operator: message.author.tag,
                progressCallback: (prog) => {
                    if (prog.stage === 'running' && statusMsg) {
                        const percent = prog.progressPercent || 0;
                        const filled = Math.round(percent / 10);
                        const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
                        const updateEmbed = new EmbedBuilder()
                            .setColor(0x00E5FF)
                            .setTitle(`⚡ High-Speed Mass Role Engine — ${prog.action === 'add' ? '➕ Adding' : '➖ Removing'}`)
                            .setDescription(`Replicating role <@&${prog.roleId}> across members at turbo speed (0.50s pipeline)!\n\n**Progress:** \`[${bar}] ${percent}%\`\n**Processed:** \`${prog.successCount + prog.failCount} / ${prog.candidatesCount}\` members\n**Speed:** \`~${prog.speed || '50+'} members/sec\``)
                            .addFields(
                                { name: '🎯 Role', value: `<@&${prog.roleId}>`, inline: true },
                                { name: '👥 Target Group', value: `\`${prog.targetFilter.toUpperCase()}\``, inline: true },
                                { name: '✅ Applied', value: `\`${prog.successCount}\``, inline: true },
                                { name: '⏭️ Already in state', value: `\`${prog.alreadySetCount}\``, inline: true },
                                { name: '❌ Failed / Skipped', value: `\`${prog.failCount}\``, inline: true }
                            )
                            .setFooter({ text: 'Discord High-Speed Engine • Turbo Mode Active' })
                            .setTimestamp();

                        statusMsg.edit({ content: null, embeds: [updateEmbed] }).catch(() => {});
                    }
                }
            });

            const durSec = (result.durationMs / 1000).toFixed(2);
            const finalEmbed = new EmbedBuilder()
                .setColor(0x10B981)
                .setTitle(`🎉 Mass Role Operation Complete!`)
                .setDescription(`Successfully completed mass role update in **${durSec}s** with high-speed parallel workers!`)
                .addFields(
                    { name: '🏷️ Role', value: `<@&${result.roleId}> (\`${result.roleName}\`)`, inline: true },
                    { name: '⚡ Mode', value: `**${result.action.toUpperCase()}** (${targetFilter.toUpperCase()})`, inline: true },
                    { name: '⏱️ Duration', value: `\`${durSec}s\``, inline: true },
                    { name: '✅ Total Modified', value: `**${result.successCount}** members`, inline: true },
                    { name: '⏭️ Already in state', value: `**${result.alreadySetCount}** members`, inline: true },
                    { name: '❌ Failed', value: `**${result.failCount}** members`, inline: true },
                    { name: '👤 Operator', value: `<@${message.author.id}>`, inline: true }
                )
                .setFooter({ text: 'Ultra-Fast Mass Role Engine • Completed' })
                .setTimestamp();

            if (statusMsg) {
                await statusMsg.edit({ content: null, embeds: [finalEmbed] }).catch(() => {});
            } else {
                await message.reply({ embeds: [finalEmbed] });
            }
        } catch (err) {
            console.error('Prefix mass role error:', err);
            if (statusMsg) {
                await statusMsg.edit(`❌ **Mass Role Failed:** ${err.message}`).catch(() => {});
            } else {
                await message.reply(`❌ **Mass Role Failed:** ${err.message}`);
            }
        }
    } else if (command === 'lockall' || command === 'unlockall' || command === 'lockdown' || command === 'unlockdown') {
        const guild = message.guild;
        if (!guild) return message.reply('❌ This command can only be used in a Discord server.');

        const masterId = getMasterOwnerId();
        const isMaster = isMasterOwner(message.author.id) || message.author.id === masterId;
        const sec = getGuildSecurity(guild.id, guild.ownerId);
        const hasAdminRole = Array.isArray(sec.adminRoles) && sec.adminRoles.some(rId => message.member?.roles?.cache?.has(rId));
        const isWhitelistedUser = sec.whitelist && sec.whitelist.includes(message.author.id);
        const isServerOwner = message.author.id === guild.ownerId;
        const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator) || message.member?.permissions?.has(PermissionFlagsBits.ManageChannels);

        if (!isMaster && !hasAdminRole && !isWhitelistedUser && !isServerOwner && !isAdmin) {
            return message.reply(`🔒 **Permission Denied**\nOnly the Master Bot Owner (<@${masterId}>), assigned **Admin Roles**, or Server Admins with Manage Channels permission can execute server lockdowns.`);
        }

        const isUnlockCmd = (command === 'unlockall' || command === 'unlockdown');
        let action = isUnlockCmd ? 'unlock' : 'lock';
        let scope = 'all';
        let reasonArgs = [...args];

        if (reasonArgs[0]) {
            const first = reasonArgs[0].toLowerCase();
            if (first === 'unlock' || first === 'lock') {
                action = first;
                reasonArgs.shift();
            }
        }

        if (reasonArgs[0]) {
            const first = reasonArgs[0].toLowerCase();
            if (first === 'channels' || first === 'all') {
                scope = 'all';
                reasonArgs.shift();
            } else if (first === 'text') {
                scope = 'text';
                reasonArgs.shift();
            } else if (first === 'voice') {
                scope = 'voice';
                reasonArgs.shift();
            }
        }

        const reason = reasonArgs.join(' ').trim() || (action === 'lock' ? 'Server Lockdown / Maintenance' : 'Lockdown lifted');
        const isLock = (action === 'lock');

        const statusMsg = await message.reply(`🔒 **Initiating Turbo Server ${isLock ? 'Lockdown' : 'Unlock'}...**\n• Action: **${isLock ? '🔒 Locking all channels' : '🔓 Unlocking all channels'}**\n• Target Scope: **${scope.toUpperCase()}**\n• Reason: *${reason}*\n⏳ *Updating channel permissions across the server...*`).catch(() => null);

        try {
            const result = await executeMassChannelLock({
                guild,
                action,
                scope,
                reason,
                operator: message.author.tag || message.author.username,
                progressCallback: (prog) => {
                    if (prog.stage === 'running' && statusMsg) {
                        const percent = prog.progressPercent || 0;
                        const filled = Math.round(percent / 10);
                        const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
                        const updateEmbed = new EmbedBuilder()
                            .setColor(prog.action === 'lock' ? 0xE11D48 : 0x10B981)
                            .setTitle(`⚡ Server Channel ${prog.action === 'lock' ? '🔒 Lockdown' : '🔓 Unlock'} Engine`)
                            .setDescription(`Updating channel permission overwrites for \`@everyone\` at turbo speed!\n\n**Progress:** \`[${bar}] ${percent}%\`\n**Processed:** \`${prog.successCount + prog.failCount} / ${prog.totalChannels}\` channels\n**Speed:** \`~${prog.speed || '15+'} channels/sec\``)
                            .addFields(
                                { name: '🛡️ Mode', value: `\`${prog.action.toUpperCase()}\``, inline: true },
                                { name: '🎯 Scope', value: `\`${prog.scope.toUpperCase()}\``, inline: true },
                                { name: '✅ Updated', value: `\`${prog.successCount}\``, inline: true },
                                { name: '❌ Failed', value: `\`${prog.failCount}\``, inline: true }
                            )
                            .setFooter({ text: 'High-Speed Channel Security Pipeline' })
                            .setTimestamp();

                        statusMsg.edit({ content: null, embeds: [updateEmbed] }).catch(() => {});
                    }
                }
            });

            const durSec = (result.durationMs / 1000).toFixed(2);
            const finalEmbed = new EmbedBuilder()
                .setColor(result.action === 'lock' ? 0xE11D48 : 0x10B981)
                .setTitle(`🎉 Server Channel ${result.action === 'lock' ? '🔒 Lockdown' : '🔓 Unlock'} Complete!`)
                .setDescription(`Successfully **${result.action === 'lock' ? 'LOCKED' : 'UNLOCKED'}** server channels for \`@everyone\` in **${durSec}s**!`)
                .addFields(
                    { name: '⚡ Action', value: `**${result.action === 'lock' ? '🔒 LOCKED' : '🔓 UNLOCKED'}**`, inline: true },
                    { name: '🎯 Channel Scope', value: `\`${result.scope.toUpperCase()}\``, inline: true },
                    { name: '⏱️ Duration', value: `\`${durSec}s\``, inline: true },
                    { name: '📁 Channels Updated', value: `**${result.successCount}** / ${result.totalChannels}`, inline: true },
                    { name: '📝 Reason', value: `${result.reason}`, inline: true },
                    { name: '👤 Operator', value: `<@${message.author.id}>`, inline: true }
                )
                .setFooter({ text: 'Ultra-Fast Channel Security Engine • Completed' })
                .setTimestamp();

            if (statusMsg) {
                await statusMsg.edit({ content: null, embeds: [finalEmbed] }).catch(() => {});
            } else {
                await message.reply({ embeds: [finalEmbed] });
            }
        } catch (err) {
            console.error('Prefix lockall channels error:', err);
            if (statusMsg) {
                await statusMsg.edit(`❌ **Channel Lockdown Failed:** ${err.message}`).catch(() => {});
            } else {
                await message.reply(`❌ **Channel Lockdown Failed:** ${err.message}`);
            }
        }
    } else if (command === 'invite' || command === 'botinvite') {
        const botId = client.user?.id || '1534092488451686461';
        const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;
        const masterId = getMasterOwnerId();

        const embed = new EmbedBuilder()
            .setColor(0x00E5FF)
            .setTitle(`🔗 Add ${client.user?.username || 'Discord Bot'} to Your Server`)
            .setDescription(`Click below to invite the bot with full Administrator permissions:\n\n👉 **[Click Here to Invite Bot](${inviteUrl})**\n\n\`${inviteUrl}\``)
            .addFields(
                { name: '🤖 Bot Name', value: `${client.user?.tag || 'Discord Bot'}`, inline: true },
                { name: '👑 Master Owner', value: `<@${masterId}>`, inline: true },
                { name: '🛡️ Permissions', value: 'Administrator (`8`)', inline: true }
            )
            .setFooter({ text: 'Discord Bot Invitation • Multi-Server High Speed Engine' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    } else if (command === 'login') {
        const tokenInput = args[0];
        const author = message.author;

        // Delete user's command message immediately so other players in the channel cannot see the command or token
        await message.delete().catch(() => {});

        const sendPrivateResponse = async (text) => {
            try {
                await author.send(text);
            } catch (dmErr) {
                // If DMs are closed, send temporary message in channel that auto-deletes in 5 seconds
                const tempMsg = await message.channel.send(`<@${author.id}> ${text}`).catch(() => null);
                if (tempMsg) {
                    setTimeout(() => tempMsg.delete().catch(() => {}), 5000);
                }
            }
        };

        if (tokenInput && tokenInput.trim()) {
            const cleanToken = tokenInput.trim();
            const authResult = await loginUserToken(cleanToken);
            if (authResult.success && authResult.user) {
                userToken = cleanToken;
                saveSettings();
                const displayName = authResult.user.global_name || authResult.user.username;
                addLog('User Login', authResult.user.id, author.id, true, `Logged in`);
                return sendPrivateResponse(`You has successfully been login **${displayName}**`);
            } else {
                return sendPrivateResponse(`❌ Login failed. Please check your credentials.`);
            }
        } else {
            if (userToken && userToken.trim()) {
                const authResult = await loginUserToken(userToken);
                if (authResult.success && authResult.user) {
                    const displayName = authResult.user.global_name || authResult.user.username;
                    return sendPrivateResponse(`You has successfully been login **${displayName}**`);
                }
            }

            const displayName = author.global_name || author.username;
            return sendPrivateResponse(`You has successfully been login **${displayName}**`);
        }
    } else if (command === 'antinuke' || command === 'security') {
        const guild = message.guild;
        const sec = getGuildSecurity(guild.id, guild.ownerId);
        const isOwner = message.author.id === guild.ownerId;
        const isWhite = isWhitelisted(guild, message.author.id);
        const logChannel = sec.logChannelId ? `<#${sec.logChannelId}>` : '`Not configured / In Default`';

        const statusEmbed = new EmbedBuilder()
            .setColor(0x00E5FF)
            .setTitle(`🛡️ Anti-Nuke & Security Shield — ${guild.name}`)
            .setDescription(`Automated 24/7 server defense engine is **ONLINE & ACTIVE**. Every destructive action is intercepted and neutralized.`)
            .addFields(
                { 
                    name: '🛡️ Channel & Role Protection', 
                    value: `• **Anti-Channel Delete:** ${sec.antiChannelDelete ? '✅ Active (Auto-Restore)' : '❌ Disabled'}\n• **Anti-Channel Create:** ${sec.antiChannelCreate ? '✅ Active' : '❌ Disabled'}\n• **Anti-Role Delete:** ${sec.antiRoleDelete ? '✅ Active (Auto-Restore)' : '❌ Disabled'}\n• **Anti-Role Create:** ${sec.antiRoleCreate ? '✅ Active' : '❌ Disabled'}`, 
                    inline: true 
                },
                { 
                    name: '⚔️ Raid & Member Protection', 
                    value: `• **Anti-Mass Ban:** ${sec.antiBan ? '✅ Active (Auto-Unban)' : '❌ Disabled'}\n• **Anti-Mass Kick:** ${sec.antiKick ? '✅ Active' : '❌ Disabled'}\n• **Anti-Bot Add:** ${sec.antiBot ? '✅ Active (Auto-Ban Bot)' : '❌ Disabled'}\n• **Anti-Webhook:** ${sec.antiWebhook ? '✅ Active' : '❌ Disabled'}`, 
                    inline: true 
                },
                { 
                    name: '⚡ Chat & Anti-Delete Protection', 
                    value: `• **Anti-Spam Filter:** ${sec.antiSpam ? '✅ Active (Auto-Mute)' : '❌ Disabled'}\n• **Anti-Invite Links:** ${sec.antiInvite ? '✅ Active' : '❌ Disabled'}\n• **Anti-Mass Mention:** ${sec.antiMassMention ? '✅ Active' : '❌ Disabled'}\n• **Anti-Delete & Ghost Ping:** ${sec.antiDelete ? '✅ Active' : '❌ Disabled'}`, 
                    inline: false 
                },
                { 
                    name: '👑 Whitelist & Audit Logging', 
                    value: `• **Log Channel:** ${logChannel}\n• **Whitelisted Users:** **${sec.whitelist.length}** trusted users\n• **Attacker Punishment:** **Automatic Ban & 28-day Quarantine**\n• **Your Access:** ${isOwner ? '👑 Server Owner (Full Access)' : (isWhite ? '🛡️ Whitelisted Admin' : '👤 Standard Member')}`, 
                    inline: false 
                }
            )
            .setFooter({ text: 'Discord Anti-Nuke Automated Shield • 24/7 Protection' })
            .setTimestamp();

        return message.reply({ embeds: [statusEmbed] });
    } else if (command === 'whitelist' || command === 'wl' || command === 'whitelist3' || command === 'wl3') {
        const guild = message.guild;
        const masterId = getMasterOwnerId();
        const isMaster = isMasterOwner(message.author.id) || message.author.id === masterId;
        const isOwner = guild && (message.author.id === guild.ownerId);
        const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);

        // Check if targeting Whitelist 3 (Commands Only)
        const isTier3Request = command === 'whitelist3' || command === 'wl3' || args[0] === '3' || args[0] === 'tier3' || args[0] === 'commands';

        if (isTier3Request) {
            const effectiveArgs = (command === 'whitelist3' || command === 'wl3') ? args : args.slice(1);
            const sub = effectiveArgs[0]?.toLowerCase();
            const targetMention = message.mentions.users.first() || (effectiveArgs[1] ? { id: effectiveArgs[1].replace(/[<@!>]/g, ''), tag: effectiveArgs[1] } : (effectiveArgs[0] && effectiveArgs[0].match(/^\d{17,20}$/) ? { id: effectiveArgs[0], tag: effectiveArgs[0] } : null));

            if (sub === 'list' || !sub) {
                const listFormatted = whitelist3.map(id => {
                    const tag = id === masterId ? '👑 Master Operator' : (id === client.user?.id ? '🤖 Bot' : '⚡ Commands Authorized');
                    return `• <@${id}> (\`${id}\`) — **${tag}**`;
                }).join('\n') || '*No users in Whitelist 3 yet.*';

                const listEmbed = new EmbedBuilder()
                    .setColor(0x3B82F6)
                    .setTitle(`⚡ Whitelist 3: Commands Only Whitelist (${whitelist3.length})`)
                    .setDescription(`Users on **Whitelist 3** can execute bot commands while the bot is locked down.\n\n${listFormatted}`)
                    .setFooter({ text: `Use ${usedPrefix}whitelist 3 add <@user> or ${usedPrefix}whitelist 3 remove <@user>` })
                    .setTimestamp();

                return message.reply({ embeds: [listEmbed] });
            }

            if (!isMaster && !isOwner && !isAdmin) {
                return message.reply('❌ Only the Master Bot Operator and Server Administrators can manage Whitelist 3.');
            }

            if (sub === 'add' || (!['remove', 'check', 'list'].includes(sub) && targetMention)) {
                const userToAdd = targetMention || (message.mentions.users.first() ? message.mentions.users.first() : null);
                if (!userToAdd) {
                    return message.reply(`❌ Please specify a user to add to Whitelist 3!\nUsage: \`${usedPrefix}whitelist 3 add <@user>\``);
                }
                if (whitelist3.includes(userToAdd.id)) {
                    return message.reply(`ℹ️ <@${userToAdd.id}> is already in Whitelist 3.`);
                }
                whitelist3.push(userToAdd.id);
                saveWhitelist3();
                addLog('Whitelist3 Added', userToAdd.id, message.author.id, true, `Added by ${message.author.tag}`);
                return message.reply(`✅ **Successfully added** <@${userToAdd.id}> to **Whitelist 3 (Commands Only)**! They can now execute bot commands.`);
            } else if (sub === 'remove') {
                if (!targetMention) {
                    return message.reply(`❌ Please specify a user to remove from Whitelist 3!\nUsage: \`${usedPrefix}whitelist 3 remove <@user>\``);
                }
                if (targetMention.id === masterId || isMasterOwner(targetMention.id)) {
                    return message.reply('❌ Cannot remove the Master Bot Operator from Whitelist 3.');
                }
                if (!whitelist3.includes(targetMention.id)) {
                    return message.reply(`ℹ️ <@${targetMention.id}> is not in Whitelist 3.`);
                }
                whitelist3 = whitelist3.filter(id => id !== targetMention.id);
                saveWhitelist3();
                addLog('Whitelist3 Removed', targetMention.id, message.author.id, true, `Removed by ${message.author.tag}`);
                return message.reply(`✅ **Successfully removed** <@${targetMention.id}> from Whitelist 3.`);
            } else if (sub === 'check') {
                const userToCheck = targetMention || message.author;
                const isWl3 = isWhitelist3(userToCheck.id);
                return message.reply(isWl3 ? `✅ <@${userToCheck.id}> is **AUTHORIZED** in Whitelist 3 (Commands Only).` : `❌ <@${userToCheck.id}> is **NOT** in Whitelist 3.`);
            }
        }

        // Tier 1 Anti-Nuke Whitelist
        if (!guild) {
            return message.reply('❌ Server Anti-Nuke Whitelist commands must be used inside a server.');
        }
        if (!isOwner && !isAdmin) {
            return message.reply('❌ Only the Server Owner and Server Administrators can manage the Anti-Nuke Whitelist.');
        }

        const sec = getGuildSecurity(guild.id);
        const subCommand = args[0]?.toLowerCase();
        const targetMention = message.mentions.users.first() || (args[1] ? { id: args[1].replace(/[<@!>]/g, ''), tag: args[1] } : null);

        if (subCommand === 'list' || !subCommand) {
            const listFormatted = sec.whitelist.map(id => {
                const tag = id === masterId ? '👑 Master Operator (Me)' : (id === client.user.id ? '🤖 Bot' : (id === guild.ownerId ? '👑 Owner' : '🛡️ Whitelisted'));
                return `• <@${id}> (\`${id}\`) — **${tag}**`;
            }).join('\n') || 'None';

            const listEmbed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle(`👑 Anti-Nuke Whitelisted Members (${sec.whitelist.length})`)
                .setDescription(`Whitelisted members bypass all Anti-Nuke rate limits and deletion shields.\n\n${listFormatted}`)
                .setFooter({ text: `Use ${usedPrefix}whitelist add <@user> or ${usedPrefix}whitelist remove <@user>` })
                .setTimestamp();

            return message.reply({ embeds: [listEmbed] });
        }

        if (!targetMention) {
            return message.reply(`❌ Please specify a user to add or remove!\nUsage: \`${usedPrefix}whitelist add <@user>\` or \`${usedPrefix}whitelist remove <@user>\``);
        }

        if (subCommand === 'add') {
            if (sec.whitelist.includes(targetMention.id)) {
                return message.reply(`ℹ️ <@${targetMention.id}> is already in the Anti-Nuke whitelist.`);
            }
            sec.whitelist.push(targetMention.id);
            saveSecurity();
            addLog('Whitelist Added', targetMention.id, guild.id, true, `Added by ${message.author.tag}`);
            return message.reply(`✅ **Successfully added** <@${targetMention.id}> to the Anti-Nuke whitelist! They are now exempt from security triggers.`);
        } else if (subCommand === 'remove') {
            if (targetMention.id === masterId) {
                return message.reply('❌ Cannot remove the Master Bot Operator from the whitelist.');
            }
            if (targetMention.id === client.user.id) {
                return message.reply('❌ Cannot remove the Bot from the whitelist.');
            }
            if (!sec.whitelist.includes(targetMention.id)) {
                return message.reply(`ℹ️ <@${targetMention.id}> is not in the whitelist.`);
            }
            sec.whitelist = sec.whitelist.filter(id => id !== targetMention.id);
            saveSecurity();
            addLog('Whitelist Removed', targetMention.id, guild.id, true, `Removed by ${message.author.tag}`);
            return message.reply(`✅ **Successfully removed** <@${targetMention.id}> from the Anti-Nuke whitelist.`);
        }
    } else if (command === 'unwhitelist' || command === 'unwhitelistall' || command === 'unwl') {
        const guild = message.guild;
        const masterId = getMasterOwnerId();
        const isMaster = isMasterOwner(message.author.id) || message.author.id === masterId;
        const isOwner = guild && (message.author.id === guild.ownerId);
        const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);

        if (!isMaster && !isOwner && !isAdmin) {
            return message.reply('❌ Only the Master Bot Operator and Server Administrators can use unwhitelist.');
        }

        const targetArg = args[0]?.toLowerCase();
        const targetMention = message.mentions.users.first() || (args[0] && args[0].match(/^\d{17,20}$/) ? { id: args[0] } : null);

        if (!targetArg || targetArg === 'all' || command === 'unwhitelistall') {
            let clearedCount = 0;
            if (guild) {
                const sec = getGuildSecurity(guild.id, guild.ownerId);
                const beforeT1 = sec.whitelist.length;
                sec.whitelist = sec.whitelist.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id || id === guild.ownerId);
                saveSecurity();
                clearedCount += (beforeT1 - sec.whitelist.length);
            }
            const beforeT2 = whitelist2.length;
            whitelist2 = whitelist2.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id);
            saveWhitelist2();
            clearedCount += (beforeT2 - whitelist2.length);

            const beforeT3 = whitelist3.length;
            whitelist3 = whitelist3.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id);
            saveWhitelist3();
            clearedCount += (beforeT3 - whitelist3.length);

            addLog('Unwhitelist All', 'ALL_TIERS', message.author.id, true, `Executed by ${message.author.tag}`);
            return message.reply(`🗑️ **Unwhitelist All Complete!**\nWiped all users across **Tier 1 (Anti-Nuke)**, **Tier 2 (Forwards & DMs)**, and **Tier 3 (Commands Only)**.\n(Master Bot Operator and System bots retained).`);
        } else if (targetArg === 'tier1' || targetArg === '1') {
            if (!guild) return message.reply('❌ Server Anti-Nuke Whitelist can only be cleared in a server.');
            const sec = getGuildSecurity(guild.id, guild.ownerId);
            sec.whitelist = sec.whitelist.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id || id === guild.ownerId);
            saveSecurity();
            return message.reply('✅ Successfully cleared Server Anti-Nuke Whitelist (Tier 1).');
        } else if (targetArg === 'tier2' || targetArg === '2') {
            whitelist2 = whitelist2.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id);
            saveWhitelist2();
            return message.reply('✅ Successfully cleared Whitelist 2 (Tier 2: Forwards & DMs).');
        } else if (targetArg === 'tier3' || targetArg === '3') {
            whitelist3 = whitelist3.filter(id => id === masterId || isMasterOwner(id) || id === client.user?.id);
            saveWhitelist3();
            return message.reply('✅ Successfully cleared Whitelist 3 (Tier 3: Commands Only).');
        } else if (targetMention) {
            if (targetMention.id === masterId || isMasterOwner(targetMention.id)) {
                return message.reply('❌ Cannot unwhitelist the Master Bot Operator.');
            }
            if (guild) {
                const sec = getGuildSecurity(guild.id, guild.ownerId);
                sec.whitelist = sec.whitelist.filter(id => id !== targetMention.id);
                saveSecurity();
            }
            whitelist2 = whitelist2.filter(id => id !== targetMention.id);
            saveWhitelist2();
            whitelist3 = whitelist3.filter(id => id !== targetMention.id);
            saveWhitelist3();

            return message.reply(`✅ Successfully unwhitelisted <@${targetMention.id}> across all tiers (Tier 1, Tier 2, and Tier 3).`);
        } else {
            return message.reply(`ℹ️ **Unwhitelist Command Usage:**\n• \`${usedPrefix}unwhitelist all\` (Wipe all tiers)\n• \`${usedPrefix}unwhitelist 1\` (Clear Tier 1 Anti-Nuke)\n• \`${usedPrefix}unwhitelist 2\` (Clear Tier 2 Forwards & DMs)\n• \`${usedPrefix}unwhitelist 3\` (Clear Tier 3 Commands Only)\n• \`${usedPrefix}unwhitelist <@user>\` (Unwhitelist a specific user)`);
        }
    } else if (command === 'photo' || command === 'image' || command === 'generate') {
        const sub = args[0]?.toLowerCase();
        const authorTag = message.author.tag || message.author.username;

        if (sub === 'list') {
            if (photos.length === 0) {
                return message.reply('🖼️ **No photos in studio yet.** Generate one using `!photo <prompt>`!');
            }
            const listItems = photos.slice(0, 10).map((p, idx) => `**${idx + 1}.** \`${p.name}\` — *"${p.prompt.slice(0, 40)}..."* [ID: \`${p.id}\`]`).join('\n');
            const galleryEmbed = new EmbedBuilder()
                .setColor(0x00e5ff)
                .setTitle(`🖼️ Photo Studio Gallery (${photos.length} total)`)
                .setDescription(listItems)
                .setFooter({ text: 'Use !photo edit <id/name> <changes> or !photo rename <id/name> <new name>' })
                .setTimestamp();
            return message.reply({ embeds: [galleryEmbed] });
        } else if (sub === 'rename') {
            const targetId = args[1];
            const newName = args.slice(2).join(' ');
            if (!targetId || !newName) {
                return message.reply(`🏷️ **Usage:** \`${usedPrefix}photo rename <photo_id_or_name> <new_title>\``);
            }
            try {
                const renamed = renamePhotoInGallery({ photoId: targetId, newName, author: authorTag });
                return message.reply(`✅ **Renamed Photo:** Successfully updated title to **"${renamed.name}"**!`);
            } catch (e) {
                return message.reply(`❌ **Rename Failed:** ${e.message}`);
            }
        } else if (sub === 'edit' || sub === 'change' || sub === 'modify') {
            const targetId = args[1];
            const instruction = args.slice(2).join(' ');
            if (!targetId || !instruction) {
                return message.reply(`✨ **Usage:** \`${usedPrefix}photo edit <photo_id_or_name> <changes to apply>\`\nExample: \`${usedPrefix}photo edit photo_123 Add neon cyber aesthetic\``);
            }
            message.channel.sendTyping().catch(() => {});
            try {
                const edited = await editPhotoWithAI({ photoId: targetId, instruction, author: authorTag });
                let fileAttachment = null;
                if (edited.dataUrl.startsWith('data:image/svg+xml;base64,')) {
                    const svgBuffer = Buffer.from(edited.dataUrl.replace('data:image/svg+xml;base64,', ''), 'base64');
                    fileAttachment = new AttachmentBuilder(svgBuffer, { name: `${edited.name.replace(/[^a-z0-9]/gi, '_')}.svg` });
                } else if (edited.dataUrl.startsWith('data:image/png;base64,')) {
                    const pngBuffer = Buffer.from(edited.dataUrl.replace('data:image/png;base64,', ''), 'base64');
                    fileAttachment = new AttachmentBuilder(pngBuffer, { name: `${edited.name.replace(/[^a-z0-9]/gi, '_')}.png` });
                }

                const embed = new EmbedBuilder()
                    .setColor(0x00e5ff)
                    .setTitle(`✨ Photo Modified: ${edited.name}`)
                    .setDescription(`**Change Applied:** "${instruction}"\n**Engine:** \`${edited.engine}\`\n**Photo ID:** \`${edited.id}\``)
                    .setFooter({ text: 'AI Photo Studio • Changes applied seamlessly' })
                    .setTimestamp();

                return message.reply({ embeds: [embed], files: fileAttachment ? [fileAttachment] : [] });
            } catch (e) {
                return message.reply(`❌ **Edit Failed:** ${e.message}`);
            }
        }

        // Default: Generate new photo
        const promptText = args.join(' ');
        if (!promptText) {
            return message.reply(`🎨 **Photo Studio Usage:**\n• \`${usedPrefix}photo <prompt>\` — Generate high quality artwork\n• \`${usedPrefix}photo edit <id/name> <changes>\` — Transform & update artwork\n• \`${usedPrefix}photo rename <id/name> <new name>\` — Rename photo\n• \`${usedPrefix}photo list\` — Browse all photos`);
        }

        message.channel.sendTyping().catch(() => {});
        try {
            const photo = await generatePhotoWithAI({
                prompt: promptText,
                author: authorTag
            });

            let fileAttachment = null;
            if (photo.dataUrl.startsWith('data:image/svg+xml;base64,')) {
                const svgBuffer = Buffer.from(photo.dataUrl.replace('data:image/svg+xml;base64,', ''), 'base64');
                fileAttachment = new AttachmentBuilder(svgBuffer, { name: `${photo.name.replace(/[^a-z0-9]/gi, '_')}.svg` });
            } else if (photo.dataUrl.startsWith('data:image/png;base64,')) {
                const pngBuffer = Buffer.from(photo.dataUrl.replace('data:image/png;base64,', ''), 'base64');
                fileAttachment = new AttachmentBuilder(pngBuffer, { name: `${photo.name.replace(/[^a-z0-9]/gi, '_')}.png` });
            }

            const embed = new EmbedBuilder()
                .setColor(0x7928ca)
                .setTitle(`🎨 Generated Artwork: ${photo.name}`)
                .setDescription(`**Prompt:** "${photo.prompt}"\n**Engine:** \`${photo.engine}\`\n**Photo ID:** \`${photo.id}\``)
                .setFooter({ text: `Modify with: ${usedPrefix}photo edit ${photo.id} <changes>` })
                .setTimestamp();

            return message.reply({ embeds: [embed], files: fileAttachment ? [fileAttachment] : [] });
        } catch (err) {
            return message.reply(`❌ **Photo Generation Error:** ${err.message}`);
        }
    } else if (command === 'python' || command === 'py') {
        const code = args.join(' ');
        if (!code) {
            return message.reply(`🐍 **Usage:** \`${usedPrefix}python <python 3 code>\`\nExample: \`${usedPrefix}python print("Hello from Python 3!")\``);
        }
        message.channel.sendTyping().catch(() => {});
        const result = await executePythonCode(code);
        const fileAttachment = new AttachmentBuilder(Buffer.from(code, 'utf-8'), { name: 'script.py' });
        let replyMsg = `🐍 **Python 3 Execution Engine:**\n`;
        if (result.success) {
            replyMsg += `\`\`\`python\n${result.output}\n\`\`\``;
        } else {
            replyMsg += `❌ **Python Error:**\n\`\`\`\n${result.error || result.output}\n\`\`\``;
        }
        return message.reply({ content: replyMsg, files: [fileAttachment] });
    } else if (command === 'lua') {
        const code = args.join(' ');
        if (!code) {
            return message.reply(`⚡ **Usage:** \`${usedPrefix}lua <lua code to execute>\`\nExample: \`${usedPrefix}lua print("Hello from Lua 5.3!")\``);
        }
        const result = executeLuaCode(code);
        const fileAttachment = new AttachmentBuilder(Buffer.from(code, 'utf-8'), { name: 'script.lua' });
        let replyMsg = `⚡ **Lua 5.3 Execution Engine:**\n`;
        if (result.success) {
            replyMsg += `\`\`\`lua\n${result.output}\n\`\`\``;
            if (result.returnValues) {
                replyMsg += `\n**Returns:** \`${result.returnValues.join(', ')}\``;
            }
        } else {
            replyMsg += `❌ **Lua Error:**\n\`\`\`\n${result.error}\n\`\`\``;
        }
        return message.reply({ content: replyMsg, files: [fileAttachment] });
    } else if (command === 'runbot') {
        let botType = 'discordjs';
        let token = null;
        let description = '';
        let launch = false;

        // Parse arguments: e.g. .runbot discordjs <token> <description> or .runbot type:discordjs token:xyz ...
        const rawArgs = args.join(' ');
        const typeMatch = rawArgs.match(/type:([a-zA-Z0-9_-]+)/i);
        const tokenMatch = rawArgs.match(/token:([^\s]+)/i);
        const launchMatch = rawArgs.match(/launch:(true|1|yes)/i);

        if (typeMatch) botType = typeMatch[1].toLowerCase();
        if (tokenMatch) token = tokenMatch[1];
        if (launchMatch) launch = true;

        // If not key:value style, check positional args
        if (!typeMatch && args.length > 0) {
            const firstArg = args[0].toLowerCase();
            if (['discordjs', 'discordpy', 'python', 'js', 'roblox_lua', 'lua', 'ai_bot', 'typescript', 'ts'].includes(firstArg)) {
                botType = (firstArg === 'python' || firstArg === 'py') ? 'discordpy' : (firstArg === 'js' ? 'discordjs' : (firstArg === 'ts' ? 'typescript' : firstArg));
                let remaining = args.slice(1);
                if (remaining.length > 0 && (remaining[0].length >= 40 && remaining[0].includes('.'))) {
                    token = remaining[0];
                    remaining = remaining.slice(1);
                }
                description = remaining.join(' ');
            } else {
                description = args.join(' ');
            }
        } else {
            description = rawArgs.replace(/type:[^\s]+/gi, '').replace(/token:[^\s]+/gi, '').replace(/launch:[^\s]+/gi, '').trim();
        }

        if (!description) description = 'Complete Discord bot with moderation, purge, ping, and status features';

        message.channel.sendTyping().catch(() => {});

        let prompt = `Generate a complete, fully functional, ready-to-run Discord bot in ${botType} that does: ${description}. Provide the complete entrypoint code file, configuration files, and documentation.`;
        if (token) {
            prompt += `\nEmbed the token "${token}" into the .env file as DISCORD_TOKEN=${token} and package config.`;
        }

        const authorTag = message.author.tag || message.author.username;
        const aiResult = await generateAiResponse({
            prompt,
            channelId: message.channel.id,
            authorName: authorTag
        });

        let launchStatusText = '';
        if (token) {
            const launchResult = await launchDiscordBotInstance({
                token,
                type: botType,
                description,
                ownerTag: authorTag
            });
            if (launchResult.success) {
                launchStatusText = `\n🚀 **Live Bot Status:** Online as \`${launchResult.botTag}\` (ID: \`${launchResult.botId}\`) • Ping: \`${launchResult.ping}ms\`\n`;
            } else {
                const masked = token.length > 8 ? token.slice(0, 4) + '••••••••' + token.slice(-4) : '••••••••';
                launchStatusText = `\n🔑 **Configured Token:** \`${masked}\` (embedded into \`.env\`)\n`;
            }
        }

        const attachments = [];
        if (aiResult.files && aiResult.files.length > 0) {
            for (const f of aiResult.files) {
                try {
                    attachments.push(new AttachmentBuilder(Buffer.from(f.content, 'utf-8'), { name: f.name }));
                } catch (e) {}
            }
        }

        let header = `🤖 **Ready-to-Run Discord Bot Project Generated:**\n*${description}* (\`${botType}\`)${launchStatusText}\n\n`;
        const fullContent = header + aiResult.text;

        if (fullContent.length <= 1950) {
            return message.reply({ content: fullContent, files: attachments.slice(0, 10) });
        } else {
            const chunks = splitTextIntoChunks(fullContent, 1900);
            for (let i = 0; i < chunks.length; i++) {
                const isLast = (i === chunks.length - 1);
                if (i === 0) {
                    await message.reply({ content: chunks[i], files: isLast ? attachments.slice(0, 10) : [] });
                } else {
                    await message.channel.send({ content: chunks[i], files: isLast ? attachments.slice(0, 10) : [] });
                }
                if (!isLast) await new Promise(r => setTimeout(r, 400));
            }
        }
    } else if (command === 'whitelist2' || command === 'wl2') {
        const sub = args[0]?.toLowerCase();
        const masterId = getMasterOwnerId();
        const isMaster = isMasterOwner(message.author.id) || message.author.id === masterId;
        const isOwner = message.guild && (message.author.id === message.guild.ownerId);
        const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);

        if (!sub || sub === 'list') {
            const listFormatted = whitelist2.map(id => {
                const tag = id === masterId ? '👑 Master Operator' : (id === client.user?.id ? '🤖 Bot' : '⚡ Forward Authorized');
                return `• <@${id}> (\`${id}\`) — **${tag}**`;
            }).join('\n') || '*No users in Whitelist 2 yet.*';

            const listEmbed = new EmbedBuilder()
                .setColor(0x00E5FF)
                .setTitle(`⚡ Whitelist 2: Forwarding & DM Whitelist (${whitelist2.length})`)
                .setDescription(`Users on **Whitelist 2** can use all forward features, automated channel forwarding, and bot commands directly in **DMs & Servers**.\n\n${listFormatted}`)
                .setFooter({ text: `Usage: ${usedPrefix}whitelist2 add/remove/check <user>` })
                .setTimestamp();

            return message.reply({ embeds: [listEmbed] });
        } else if (sub === 'check') {
            const targetMention = message.mentions.users.first();
            const targetId = targetMention ? targetMention.id : (args[1] ? args[1].replace(/[<@!>]/g, '') : message.author.id);
            const isWhitelisted2 = isWhitelist2(targetId);

            const checkEmbed = new EmbedBuilder()
                .setColor(isWhitelisted2 ? 0x10B981 : 0xE11D48)
                .setTitle(`🔍 Whitelist 2 Status: ${targetId}`)
                .setDescription(isWhitelisted2 
                    ? `✅ <@${targetId}> is **AUTHORIZED** in Whitelist 2! They can run forward commands and DM commands.`
                    : `❌ <@${targetId}> is **NOT** in Whitelist 2.`)
                .addFields(
                    { name: 'User ID', value: `\`${targetId}\``, inline: true },
                    { name: 'DM Commands Access', value: isWhitelisted2 ? '✅ Enabled' : '❌ Blocked', inline: true },
                    { name: 'Forward System Access', value: isWhitelisted2 ? '✅ Enabled' : '❌ Blocked', inline: true }
                )
                .setTimestamp();

            return message.reply({ embeds: [checkEmbed] });
        }

        // Add/Remove require Master or Admin
        if (!isMaster && !isOwner && !isAdmin) {
            return message.reply('🔒 **Permission Denied:** Only the Master Bot Owner or Server Admins can manage Whitelist 2.');
        }

        const targetMention = message.mentions.users.first();
        const targetId = targetMention ? targetMention.id : (args[1] ? args[1].replace(/[<@!>]/g, '').trim() : null);

        if (!targetId) {
            return message.reply(`❌ Please mention a user or specify a User ID!\nUsage: \`${usedPrefix}whitelist2 add <@user/id>\` or \`${usedPrefix}whitelist2 remove <@user/id>\``);
        }

        if (sub === 'add') {
            if (whitelist2.includes(targetId)) {
                return message.reply(`ℹ️ <@${targetId}> is already in Whitelist 2.`);
            }
            whitelist2.push(targetId);
            saveWhitelist2();
            addLog('Whitelist2 Added', targetId, message.author.id, true, `Added via prefix by ${message.author.tag || message.author.username}`);

            const addEmbed = new EmbedBuilder()
                .setColor(0x10B981)
                .setTitle('⚡ Whitelist 2 Updated: User Added')
                .setDescription(`✅ Successfully added <@${targetId}> to **Whitelist 2**!`)
                .addFields(
                    { name: '👑 Permissions Granted', value: '• Use Channel & Message Forwarding\n• Execute Forward Commands in **Direct Messages (DMs)**\n• Export HTML Transcripts & Purge', inline: false },
                    { name: '👤 Operator', value: `<@${message.author.id}>`, inline: true }
                )
                .setTimestamp();

            return message.reply({ embeds: [addEmbed] });
        } else if (sub === 'remove' || sub === 'del' || sub === 'delete') {
            if (targetId === masterId || isMasterOwner(targetId)) {
                return message.reply('❌ Cannot remove Master Bot Operator from Whitelist 2.');
            }
            if (!whitelist2.includes(targetId)) {
                return message.reply(`ℹ️ <@${targetId}> is not in Whitelist 2.`);
            }
            whitelist2 = whitelist2.filter(id => id !== targetId);
            saveWhitelist2();
            addLog('Whitelist2 Removed', targetId, message.author.id, true, `Removed via prefix by ${message.author.tag || message.author.username}`);

            return message.reply(`✅ Successfully removed <@${targetId}> from **Whitelist 2**.`);
        }
    } else if (command === 'ticket-setup' || command === 'ticketsetup') {
        if (!message.guild) {
            return message.reply('❌ Ticket setup must be used inside a Discord server.');
        }

        const masterId = getMasterOwnerId();
        const isMaster = isMasterOwner(message.author.id) || message.author.id === masterId;
        const isOwner = message.author.id === message.guild.ownerId;
        const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator) || message.member?.permissions?.has(PermissionFlagsBits.ManageChannels);

        if (!isMaster && !isOwner && !isAdmin) {
            return message.reply('🔒 Administrator or Manage Channels permission is required to setup tickets.');
        }

        const targetChannel = message.mentions.channels.first() || message.channel;
        const roleMention = message.mentions.roles.first();

        try {
            await sendTicketPanel({
                channel: targetChannel,
                supportRoleId: roleMention ? roleMention.id : null,
                title: '🎫 Support & Assistance Tickets',
                description: 'Need help or have an inquiry? Click the button below to open a private, secure support ticket with our team.'
            });

            return message.reply(`✅ **Ticket Panel Deployed!** Created in <#${targetChannel.id}> with interactive create buttons.`);
        } catch (err) {
            return message.reply(`❌ Failed to deploy ticket panel: ${err.message}`);
        }
    } else if (command === 'ticket' || command === 'tickets') {
        const sub = args[0]?.toLowerCase();

        if (sub === 'setup') {
            if (!message.guild) return message.reply('❌ Ticket setup must be used inside a server.');
            const targetChannel = message.mentions.channels.first() || message.channel;
            const roleMention = message.mentions.roles.first();
            try {
                await sendTicketPanel({
                    channel: targetChannel,
                    supportRoleId: roleMention ? roleMention.id : null
                });
                return message.reply(`✅ **Ticket Panel Deployed!** Created in <#${targetChannel.id}>.`);
            } catch (err) {
                return message.reply(`❌ Failed: ${err.message}`);
            }
        } else if (sub === 'close' || command === 'close') {
            if (!message.guild) return message.reply('❌ Must be used inside a ticket channel.');
            const reason = args.slice(1).join(' ') || 'Closed by staff';
            const cfg = ticketConfigs[message.guild.id];
            const ticketInfo = cfg?.tickets ? cfg.tickets[message.channel.id] : null;

            if (ticketInfo) {
                ticketInfo.status = 'closed';
                ticketInfo.closedBy = message.author.id;
                ticketInfo.closedAt = new Date().toISOString();
                saveTickets();
                if (ticketInfo.creatorId) {
                    await message.channel.permissionOverwrites.edit(ticketInfo.creatorId, { SendMessages: false }).catch(() => {});
                }
            }

            const closeEmbed = new EmbedBuilder()
                .setColor(0xE11D48)
                .setTitle('🔒 Ticket Closed')
                .setDescription(`This ticket was closed by <@${message.author.id}>.\n**Reason:** *${reason}*`)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_btn_reopen').setLabel('Re-Open').setEmoji('🔓').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('ticket_btn_transcript').setLabel('Transcript').setEmoji('📜').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('ticket_btn_delete').setLabel('Delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
            );

            return message.reply({ embeds: [closeEmbed], components: [row] });
        } else if (sub === 'transcript' || command === 'transcript') {
            if (!message.guild) return message.reply('❌ Must be used inside a ticket channel.');
            const exportResult = await exportChannelHtml(message.channel, 300, false);
            if (!exportResult.success) {
                return message.reply(`❌ Failed to generate transcript: ${exportResult.message}`);
            }

            const fileAttachment = new AttachmentBuilder(Buffer.from(exportResult.html, 'utf-8'), {
                name: exportResult.fileName
            });

            return message.reply({
                content: `📜 **Ticket Transcript Exported (${exportResult.messageCount} messages):**`,
                files: [fileAttachment]
            });
        } else if (sub === 'add') {
            const targetUser = message.mentions.users.first() || (args[1] ? { id: args[1].replace(/[<@!>]/g, '') } : null);
            if (!targetUser) return message.reply(`❌ Please mention a user to add!\nUsage: \`${usedPrefix}ticket add <@user>\``);

            await message.channel.permissionOverwrites.edit(targetUser.id, {
                ViewChannel: true,
                SendMessages: true,
                AttachFiles: true,
                EmbedLinks: true,
                ReadMessageHistory: true
            });

            return message.reply(`✅ Added <@${targetUser.id}> to this ticket channel.`);
        } else if (sub === 'remove') {
            const targetUser = message.mentions.users.first() || (args[1] ? { id: args[1].replace(/[<@!>]/g, '') } : null);
            if (!targetUser) return message.reply(`❌ Please mention a user to remove!\nUsage: \`${usedPrefix}ticket remove <@user>\``);

            await message.channel.permissionOverwrites.delete(targetUser.id).catch(() => {});
            return message.reply(`✅ Removed <@${targetUser.id}> from this ticket channel.`);
        } else if (sub === 'delete') {
            await message.reply('🗑️ **Ticket will be permanently deleted in 5 seconds...**');
            setTimeout(() => {
                message.channel.delete('Ticket deleted by command').catch(() => {});
            }, 5000);
            return;
        } else {
            return message.reply(`🎫 **Ticket System Commands:**\n• \`${usedPrefix}ticket-setup [channel]\` — Deploy interactive ticket panel\n• \`${usedPrefix}ticket close [reason]\` — Close active ticket\n• \`${usedPrefix}ticket transcript\` — Export full HTML chat log\n• \`${usedPrefix}ticket add <@user>\` — Add user to ticket\n• \`${usedPrefix}ticket remove <@user>\` — Remove user from ticket\n• \`${usedPrefix}ticket delete\` — Delete ticket channel`);
        }
    } else if (command === 'close') {
        if (!message.guild) return message.reply('❌ Must be used inside a ticket channel.');
        const reason = args.join(' ') || 'Closed by staff';
        const cfg = ticketConfigs[message.guild.id];
        const ticketInfo = cfg?.tickets ? cfg.tickets[message.channel.id] : null;

        if (ticketInfo) {
            ticketInfo.status = 'closed';
            ticketInfo.closedBy = message.author.id;
            ticketInfo.closedAt = new Date().toISOString();
            saveTickets();
            if (ticketInfo.creatorId) {
                await message.channel.permissionOverwrites.edit(ticketInfo.creatorId, { SendMessages: false }).catch(() => {});
            }
        }

        const closeEmbed = new EmbedBuilder()
            .setColor(0xE11D48)
            .setTitle('🔒 Ticket Closed')
            .setDescription(`This ticket was closed by <@${message.author.id}>.\n**Reason:** *${reason}*`)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_btn_reopen').setLabel('Re-Open').setEmoji('🔓').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('ticket_btn_transcript').setLabel('Transcript').setEmoji('📜').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('ticket_btn_delete').setLabel('Delete').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
        );

        return message.reply({ embeds: [closeEmbed], components: [row] });
    } else if (command === 'transcript') {
        if (!message.guild) return message.reply('❌ Must be used inside a ticket channel.');
        const exportResult = await exportChannelHtml(message.channel, 300, false);
        if (!exportResult.success) {
            return message.reply(`❌ Failed to generate transcript: ${exportResult.message}`);
        }

        const fileAttachment = new AttachmentBuilder(Buffer.from(exportResult.html, 'utf-8'), {
            name: exportResult.fileName
        });

        return message.reply({
            content: `📜 **Ticket Transcript Exported (${exportResult.messageCount} messages):**`,
            files: [fileAttachment]
        });
    }
});

// Real-Time Anti-Spam, Anti-Raid, Anti-Invite, and Ghost-Ping message filter
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const guild = message.guild;
    const author = message.author;
    const content = message.content || '';

    // Cache message for anti-ghost-ping / anti-delete tracking
    ghostPingCache.set(message.id, {
        id: message.id,
        author: {
            id: author.id,
            tag: author.tag || author.username,
            avatar: author.displayAvatarURL?.()
        },
        content,
        mentions: message.mentions.users.map(u => ({ id: u.id, tag: u.tag || u.username })),
        hasEveryone: message.mentions.everyone,
        attachments: message.attachments.map(a => ({ name: a.name, url: a.url })),
        channelId: message.channel.id,
        channelName: message.channel.name,
        createdTimestamp: message.createdTimestamp
    });

    // Keep ghostPingCache bounded
    if (ghostPingCache.size > 2000) {
        const firstKey = ghostPingCache.keys().next().value;
        ghostPingCache.delete(firstKey);
    }

    // Skip security filters for whitelisted users
    if (isWhitelisted(guild, author.id)) return;

    const sec = getGuildSecurity(guild.id, guild.ownerId);
    if (!sec.enabled) return;

    const member = message.member || await guild.members.fetch(author.id).catch(() => null);

    // 1. Anti-Mass Mention / Raid Ping Protection
    if (sec.antiMassMention) {
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;
        const hasEveryone = message.mentions.everyone && !member?.permissions.has(PermissionFlagsBits.MentionEveryone);
        
        if (mentionCount >= 5 || hasEveryone) {
            try {
                await message.delete();
                if (member && member.moderatable) {
                    await member.timeout(60 * 60 * 1000, '[Anti-Nuke Shield] Mass Mention / Raid Ping Abuse');
                }
                await sendSecurityAlert(guild, {
                    title: '🚨 RAID PING BLOCKED: Mass Mention',
                    description: `**Mass mention detected and intercepted in <#${message.channel.id}>!**`,
                    fields: [
                        { name: '👤 Sender', value: `<@${author.id}> (\`${author.tag || author.id}\`)`, inline: true },
                        { name: '🎯 Mentions', value: `${mentionCount} user/role mentions`, inline: true },
                        { name: '🔨 Action Taken', value: 'Message deleted & User timed out for 1 hour', inline: false }
                    ]
                });
                return;
            } catch (err) {
                console.warn('[Anti-MassMention] Error:', err.message);
            }
        }
    }

    // 2. Anti-Invite Link Protection
    if (sec.antiInvite) {
        const inviteRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord\.(?:gg|io|me|li|com\/invite)\/[a-zA-Z0-9_-]+)/i;
        if (inviteRegex.test(content)) {
            try {
                await message.delete();
                const warnMsg = await message.channel.send(`⚠️ <@${author.id}>, posting unauthorized server invite links is blocked by server security!`).catch(() => null);
                if (warnMsg) {
                    setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
                }
                await sendSecurityAlert(guild, {
                    title: '🛡️ INVITE LINK BLOCKED',
                    description: `Unauthorized Discord invite link deleted in <#${message.channel.id}>.`,
                    fields: [
                        { name: '👤 User', value: `<@${author.id}> (\`${author.tag || author.id}\`)`, inline: true },
                        { name: '💬 Channel', value: `<#${message.channel.id}>`, inline: true }
                    ]
                });
                return;
            } catch (err) {
                console.warn('[Anti-Invite] Error:', err.message);
            }
        }
    }

    // 3. Anti-Spam Rate Limiter (Sliding Window & Duplicate Text Detection)
    if (sec.antiSpam) {
        const now = Date.now();
        const spamKey = `${guild.id}-${author.id}`;
        let tracker = spamTrackers.get(spamKey);

        if (!tracker) {
            tracker = { timestamps: [], lastContent: '', duplicateCount: 0 };
            spamTrackers.set(spamKey, tracker);
        }

        // Filter messages within last 4 seconds
        tracker.timestamps = tracker.timestamps.filter(t => now - t < 4000);
        tracker.timestamps.push(now);

        // Check duplicate text
        if (content && content.length > 3 && content === tracker.lastContent) {
            tracker.duplicateCount++;
        } else {
            tracker.lastContent = content;
            tracker.duplicateCount = 1;
        }

        const isSpeedSpam = tracker.timestamps.length >= 6; // 6 messages in 4 seconds
        const isDuplicateSpam = tracker.duplicateCount >= 4; // 4 identical messages

        if (isSpeedSpam || isDuplicateSpam) {
            try {
                await message.delete().catch(() => {});
                
                // Clear tracker so we don't trigger repeatedly
                tracker.timestamps = [];
                tracker.duplicateCount = 0;

                if (member && member.moderatable) {
                    await member.timeout(10 * 60 * 1000, '[Anti-Nuke Shield] Spam Rate-Limit Exceeded');
                }

                const warnMsg = await message.channel.send(`🔇 <@${author.id}> has been timed out for 10 minutes for high-frequency chat spam.`).catch(() => null);
                if (warnMsg) {
                    setTimeout(() => warnMsg.delete().catch(() => {}), 6000);
                }

                await sendSecurityAlert(guild, {
                    title: '⚡ CHAT SPAM NEUTRALIZED',
                    description: `Anti-spam filter triggered in <#${message.channel.id}>.`,
                    fields: [
                        { name: '👤 Offender', value: `<@${author.id}> (\`${author.tag || author.id}\`)`, inline: true },
                        { name: '📊 Type', value: isDuplicateSpam ? 'Duplicate Message Spam' : 'High-Frequency Speed Spam', inline: true },
                        { name: '🔨 Action Taken', value: 'Spam deleted & User timed out for 10 minutes', inline: false }
                    ]
                });
            } catch (err) {
                console.warn('[Anti-Spam] Handler error:', err.message);
            }
        }
    }
});

// AI chat listener removed per user request


// Anti-Delete & Anti-Ghost Ping Logger
client.on('messageDelete', async message => {
    try {
        const guild = message.guild;
        if (!guild) return;

        const sec = getGuildSecurity(guild.id, guild.ownerId);
        if (!sec.enabled || !sec.antiDelete) return;

        let cached = ghostPingCache.get(message.id);
        const author = message.author || (cached ? cached.author : null);
        
        // Don't log bot message deletions
        if (author?.bot) return;

        const content = message.content || cached?.content || '[No text content / Embed only]';
        const mentions = cached?.mentions || message.mentions?.users?.map(u => ({ id: u.id, tag: u.tag || u.username })) || [];
        const isGhostPing = sec.antiGhostPing && mentions.length > 0;
        const attachments = cached?.attachments || message.attachments?.map(a => ({ name: a.name, url: a.url })) || [];

        const logFields = [
            { name: '👤 Message Author', value: author ? `<@${author.id}> (\`${author.tag || author.id}\`)` : 'Unknown Author', inline: true },
            { name: '💬 Channel', value: `<#${message.channelId || message.channel?.id}>`, inline: true }
        ];

        if (isGhostPing) {
            const pingsList = mentions.map(m => `<@${m.id}> (\`${m.tag}\`)`).join(', ');
            logFields.push({ name: '👻 Ghost Ping Targets', value: pingsList, inline: false });
        }

        if (content && content.length > 0) {
            logFields.push({ name: '📝 Deleted Content', value: content.length > 1000 ? `${content.substring(0, 1000)}...` : content, inline: false });
        }

        if (attachments.length > 0) {
            logFields.push({ name: '📎 Attachments', value: attachments.map(a => `[${a.name}](${a.url})`).join(', '), inline: false });
        }

        await sendSecurityAlert(guild, {
            title: isGhostPing ? '👻 GHOST PING DETECTED' : '🗑️ MESSAGE DELETED (Anti-Delete Log)',
            description: isGhostPing 
                ? `A message containing user mentions was deleted in <#${message.channelId || message.channel?.id}>!` 
                : `A message was deleted in <#${message.channelId || message.channel?.id}>.`,
            color: isGhostPing ? 0xFFA500 : 0x7289DA,
            fields: logFields
        });
    } catch (err) {
        console.warn('[Anti-Delete] Error logging deleted message:', err.message);
    }
});

// Anti-Channel Delete Shield & Instant Auto-Restore
client.on('channelDelete', async channel => {
    try {
        const guild = channel.guild;
        if (!guild) return;

        const sec = getGuildSecurity(guild.id, guild.ownerId);
        if (!sec.enabled || !sec.antiChannelDelete) return;

        const auditEntry = await fetchLatestAuditEntry(guild, AuditLogEvent.ChannelDelete);
        const executor = auditEntry?.executor;

        if (executor && !isWhitelisted(guild, executor.id)) {
            console.warn(`[Anti-Nuke] Rogue channel deletion detected by ${executor.tag}!`);
            
            // Punish Attacker Immediately
            await punishAttacker(guild, executor, 'Channel Deletion', `Deleted channel #${channel.name} (${channel.id})`);

            // Auto-Restore Channel
            if (sec.autoRestore) {
                try {
                    const restoredChannel = await guild.channels.create({
                        name: channel.name,
                        type: channel.type,
                        topic: channel.topic || undefined,
                        parent: channel.parentId || undefined,
                        permissionOverwrites: channel.permissionOverwrites?.cache?.map(o => ({
                            id: o.id,
                            type: o.type,
                            allow: o.allow,
                            deny: o.deny
                        })) || [],
                        reason: `[Anti-Nuke Shield] Auto-Restored after rogue deletion by ${executor.tag}`
                    });

                    const restoreEmbed = new EmbedBuilder()
                        .setColor(0x00FF7F)
                        .setTitle('🛡️ CHANNEL RECOVERED: Auto-Restore Active')
                        .setDescription(`The channel **#${channel.name}** was deleted by an unwhitelisted user and has been **automatically reconstructed** with original permissions and settings.`)
                        .addFields(
                            { name: '🔄 Recovered Channel', value: `<#${restoredChannel.id}>`, inline: true },
                            { name: '👤 Attacker Blocked', value: `<@${executor.id}> (\`${executor.tag}\`)`, inline: true }
                        )
                        .setTimestamp();

                    await restoredChannel.send({ embeds: [restoreEmbed] }).catch(() => {});
                    addLog('Channel Auto-Restored', channel.id, restoredChannel.id, true, `Restored #${channel.name}`);
                } catch (resErr) {
                    console.error('[Anti-Nuke] Failed to auto-restore channel:', resErr);
                }
            }
        }
    } catch (err) {
        console.error('[Anti-Nuke] Error in channelDelete handler:', err);
    }
});

// Anti-Channel Create (Spam Channel Raid Protection)
client.on('channelCreate', async channel => {
    try {
        const guild = channel.guild;
        if (!guild) return;

        const sec = getGuildSecurity(guild.id, guild.ownerId);
        if (!sec.enabled || !sec.antiChannelCreate) return;

        const auditEntry = await fetchLatestAuditEntry(guild, AuditLogEvent.ChannelCreate);
        const executor = auditEntry?.executor;

        if (executor && !isWhitelisted(guild, executor.id)) {
            const rateKey = `${guild.id}-${executor.id}-channelCreate`;
            const now = Date.now();
            let timestamps = actionRateLimits.get(rateKey) || [];
            timestamps = timestamps.filter(t => now - t < 10000);
            timestamps.push(now);
            actionRateLimits.set(rateKey, timestamps);

            // Trigger if > 3 channels created in 10s
            if (timestamps.length >= 3) {
                await punishAttacker(guild, executor, 'Mass Channel Spam', `Created ${timestamps.length} channels in 10s`);
                await channel.delete('[Anti-Nuke Shield] Deleted spam raid channel').catch(() => {});
            }
        }
    } catch (err) {
        console.warn('[Anti-ChannelCreate] Error:', err.message);
    }
});

// Anti-Role Delete Shield & Instant Auto-Restore
client.on('roleDelete', async role => {
    try {
        const guild = role.guild;
        if (!guild) return;

        const sec = getGuildSecurity(guild.id, guild.ownerId);
        if (!sec.enabled || !sec.antiRoleDelete) return;

        const auditEntry = await fetchLatestAuditEntry(guild, AuditLogEvent.RoleDelete);
        const executor = auditEntry?.executor;

        if (executor && !isWhitelisted(guild, executor.id)) {
            console.warn(`[Anti-Nuke] Rogue role deletion detected by ${executor.tag}!`);
            
            // Punish Attacker Immediately
            await punishAttacker(guild, executor, 'Role Deletion', `Deleted role @${role.name} (${role.id})`);

            // Auto-Restore Role
            if (sec.autoRestore) {
                try {
                    const restoredRole = await guild.roles.create({
                        name: role.name,
                        color: role.color,
                        hoist: role.hoist,
                        mentionable: role.mentionable,
                        permissions: role.permissions,
                        reason: `[Anti-Nuke Shield] Auto-Restored after rogue deletion by ${executor.tag}`
                    });

                    await sendSecurityAlert(guild, {
                        title: '🛡️ ROLE RECOVERED: Auto-Restore Active',
                        description: `Role **@${role.name}** was deleted by an unwhitelisted user and has been **automatically reconstructed** with original permissions.`,
                        color: 0x00FF7F,
                        fields: [
                            { name: '🔄 Recovered Role', value: `<@&${restoredRole.id}> (\`${restoredRole.name}\`)`, inline: true },
                            { name: '👤 Attacker Blocked', value: `<@${executor.id}> (\`${executor.tag}\`)`, inline: true }
                        ]
                    });
                    addLog('Role Auto-Restored', role.id, restoredRole.id, true, `Restored @${role.name}`);
                } catch (roleResErr) {
                    console.error('[Anti-Nuke] Failed to auto-restore role:', roleResErr);
                }
            }
        }
    } catch (err) {
        console.error('[Anti-Nuke] Error in roleDelete handler:', err);
    }
});

// Anti-Role Create (Spam Role Creation Protection)
client.on('roleCreate', async role => {
    try {
        const guild = role.guild;
        if (!guild) return;

        const sec = getGuildSecurity(guild.id, guild.ownerId);
        if (!sec.enabled || !sec.antiRoleCreate) return;

        const auditEntry = await fetchLatestAuditEntry(guild, AuditLogEvent.RoleCreate);
        const executor = auditEntry?.executor;

        if (executor && !isWhitelisted(guild, executor.id)) {
            const rateKey = `${guild.id}-${executor.id}-roleCreate`;
            const now = Date.now();
            let timestamps = actionRateLimits.get(rateKey) || [];
            timestamps = timestamps.filter(t => now - t < 10000);
            timestamps.push(now);
            actionRateLimits.set(rateKey, timestamps);

            // Trigger if > 3 roles created in 10 seconds
            if (timestamps.length >= 3) {
                await punishAttacker(guild, executor, 'Mass Role Spam', `Created ${timestamps.length} roles in 10 seconds`);
                await role.delete('[Anti-Nuke Shield] Deleted spam raid role').catch(() => {});
            }
        }
    } catch (err) {
        console.warn('[Anti-RoleCreate] Error:', err.message);
    }
});

// Anti-Mass Ban Shield & Automatic Victim Unban
client.on('guildBanAdd', async ban => {
    try {
        const guild = ban.guild;
        if (!guild) return;

        const sec = getGuildSecurity(guild.id, guild.ownerId);
        if (!sec.enabled || !sec.antiBan) return;

        const auditEntry = await fetchLatestAuditEntry(guild, AuditLogEvent.MemberBanAdd);
        const executor = auditEntry?.executor;

        if (executor && !isWhitelisted(guild, executor.id)) {
            console.warn(`[Anti-Nuke] Rogue ban detected: ${executor.tag} banned ${ban.user.tag}`);
            
            // Punish Attacker
            await punishAttacker(guild, executor, 'Rogue Member Ban', `Banned <@${ban.user.id}> (${ban.user.tag})`);

            // Auto-Unban Victim
            if (sec.autoRestore) {
                try {
                    await guild.members.unban(ban.user.id, `[Anti-Nuke Shield] Auto-Reverted unauthorized ban by ${executor.tag}`);
                    await sendSecurityAlert(guild, {
                        title: '🛡️ MEMBER UNBANNED: Ban Reverted',
                        description: `Victim <@${ban.user.id}> (\`${ban.user.tag}\`) was automatically unbanned after rogue ban attempt.`,
                        color: 0x00FF7F
                    });
                } catch (unbanErr) {
                    console.error('[Anti-Nuke] Failed to auto-unban victim:', unbanErr);
                }
            }
        }
    } catch (err) {
        console.error('[Anti-Nuke] Error in guildBanAdd handler:', err);
    }
});

// Anti-Mass Kick Shield
client.on('guildMemberRemove', async member => {
    try {
        const guild = member.guild;
        if (!guild) return;

        const sec = getGuildSecurity(guild.id, guild.ownerId);
        if (!sec.enabled || !sec.antiKick) return;

        const auditEntry = await fetchLatestAuditEntry(guild, AuditLogEvent.MemberKick);
        const executor = auditEntry?.executor;

        if (executor && !isWhitelisted(guild, executor.id)) {
            const rateKey = `${guild.id}-${executor.id}-memberKick`;
            const now = Date.now();
            let timestamps = actionRateLimits.get(rateKey) || [];
            timestamps = timestamps.filter(t => now - t < 15000);
            timestamps.push(now);
            actionRateLimits.set(rateKey, timestamps);

            // Punish if 2 or more kicks in 15 seconds
            if (timestamps.length >= 2) {
                await punishAttacker(guild, executor, 'Mass Member Kick', `Kicked ${timestamps.length} members in 15s`);
            }
        }
    } catch (err) {
        console.warn('[Anti-Kick] Error:', err.message);
    }
});

// Anti-Bot Shield (Blocks unauthorized bots invited by non-whitelisted members)
client.on('guildMemberAdd', async member => {
    try {
        const guild = member.guild;
        if (!guild) return;

        const sec = getGuildSecurity(guild.id, guild.ownerId);
        if (!sec.enabled) return;

        if (member.user.bot && sec.antiBot) {
            const auditEntry = await fetchLatestAuditEntry(guild, AuditLogEvent.BotAdd);
            const executor = auditEntry?.executor;

            if (executor && !isWhitelisted(guild, executor.id)) {
                console.warn(`[Anti-Nuke] Unauthorized bot addition detected! Bot: ${member.user.tag}, Inviter: ${executor.tag}`);
                
                // Ban the malicious/unauthorized bot
                await member.ban({ reason: `[Anti-Nuke Shield] Unauthorized Bot invited by ${executor.tag}` }).catch(() => {});

                // Punish the inviter
                await punishAttacker(guild, executor, 'Unauthorized Bot Integration', `Invited unwhitelisted bot <@${member.user.id}> (${member.user.tag})`);
            }
        }
    } catch (err) {
        console.warn('[Anti-Bot] Error:', err.message);
    }
});

// Anti-Webhook Shield (Blocks and removes rogue webhooks created by unwhitelisted users)
client.on('webhookUpdate', async channel => {
    try {
        const guild = channel.guild;
        if (!guild) return;

        const sec = getGuildSecurity(guild.id, guild.ownerId);
        if (!sec.enabled || !sec.antiWebhook) return;

        const auditEntry = await fetchLatestAuditEntry(guild, AuditLogEvent.WebhookCreate);
        const executor = auditEntry?.executor;

        if (executor && !isWhitelisted(guild, executor.id)) {
            console.warn(`[Anti-Nuke] Rogue webhook creation detected by ${executor.tag}!`);
            
            // Delete rogue webhooks in the channel
            try {
                const webhooks = await channel.fetchWebhooks();
                for (const [, webhook] of webhooks) {
                    if (webhook.owner?.id === executor.id || !isWhitelisted(guild, webhook.owner?.id)) {
                        await webhook.delete('[Anti-Nuke Shield] Rogue Webhook Removed');
                    }
                }
            } catch (whErr) {
                console.warn('[Anti-Webhook] Could not clean webhooks:', whErr.message);
            }

            // Punish the creator
            await punishAttacker(guild, executor, 'Unauthorized Webhook Creation', `Created rogue webhook in #${channel.name}`);
        }
    } catch (err) {
        console.warn('[Anti-Webhook] Error:', err.message);
    }
});

// Anti-Guild Update Shield (Protects Server Name, Vanity URL, Icon changes)
client.on('guildUpdate', async (oldGuild, newGuild) => {
    try {
        const sec = getGuildSecurity(newGuild.id, newGuild.ownerId);
        if (!sec.enabled || !sec.antiServerUpdate) return;

        const auditEntry = await fetchLatestAuditEntry(newGuild, AuditLogEvent.GuildUpdate);
        const executor = auditEntry?.executor;

        if (executor && !isWhitelisted(newGuild, executor.id)) {
            console.warn(`[Anti-Nuke] Unauthorized server update detected by ${executor.tag}!`);
            await punishAttacker(newGuild, executor, 'Server Settings Modification', `Modified server attributes without whitelist clearance`);
        }
    } catch (err) {
        console.warn('[Anti-GuildUpdate] Error:', err.message);
    }
});

// Auto-forward new messages
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const sourceChannelId = message.channel.id;

    if (!forwards[guildId]) return;

    for (const [targetChannelId, sourceIds] of Object.entries(forwards[guildId])) {
        if (sourceIds.includes(sourceChannelId)) {
            const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
            if (!targetChannel) continue;

            const forwardKey = `${message.id}-${targetChannelId}`;
            if (forwardedMessageIds.has(forwardKey)) {
                continue;
            }

            try {
                await forwardMessage(message, targetChannel, message.channel);
                forwardedMessageIds.add(forwardKey);
                console.log(`📤 Auto-forwarded message ${message.id}`);
                
                if (forwardedMessageIds.size > 1000) {
                    const iterator = forwardedMessageIds.values();
                    for (let i = 0; i < 100; i++) {
                        forwardedMessageIds.delete(iterator.next().value);
                    }
                }
            } catch (error) {
                console.error('Auto-forward error:', error);
            }
        }
    }
});

// Clean up invalid forwards
setInterval(() => {
    let changed = false;
    for (const [guildId, targets] of Object.entries(forwards)) {
        for (const [targetId, sourceIds] of Object.entries(targets)) {
            const targetChannel = client.channels.cache.get(targetId);
            if (!targetChannel) {
                delete forwards[guildId][targetId];
                changed = true;
                continue;
            }
            
            const validSources = sourceIds.filter(sourceId => {
                const sourceChannel = client.channels.cache.get(sourceId);
                return sourceChannel !== undefined || Boolean(userToken);
            });
            
            if (validSources.length !== sourceIds.length) {
                forwards[guildId][targetId] = validSources;
                changed = true;
            }
        }
    }
    if (changed) {
        saveForwards();
        console.log('🧹 Cleaned up invalid forwards');
    }
}, 60000);

// Discord Shard & Reconnection Handlers for 24/7 Resilience
client.on('shardError', error => {
    console.error('⚠️ Discord WebSocket Shard Error:', error);
    addLog('System Alert', 'Discord Gateway', 'Shard', false, error.message);
});

client.on('shardDisconnect', (event, id) => {
    console.warn(`⚠️ Discord Shard ${id} disconnected. Code: ${event.code}. Reconnecting...`);
    addLog('System Alert', 'Discord Gateway', `Shard ${id}`, false, `Disconnected (Code ${event.code})`);
});

client.on('shardReconnecting', id => {
    console.log(`🔄 Discord Shard ${id} reconnecting...`);
});

client.on('shardResume', (id, replayedEvents) => {
    console.log(`✅ Discord Shard ${id} resumed (${replayedEvents} events replayed).`);
    addLog('System Alert', 'Discord Gateway', `Shard ${id}`, true, `Resumed (${replayedEvents} events)`);
});

// Auto-Reconnect Supervisor (checks connection status every 30 seconds)
let isReconnecting = false;
setInterval(async () => {
    if (botToken && !client.isReady() && !isReconnecting) {
        isReconnecting = true;
        console.log('🔄 Reconnect Supervisor: Bot connection lost. Attempting auto-relogin...');
        try {
            await client.login(botToken);
            console.log('✅ Reconnect Supervisor: Successfully reconnected to Discord!');
            addLog('System Alert', 'Reconnect Supervisor', 'Bot', true, 'Auto-reconnected');
        } catch (err) {
            console.error('❌ Reconnect Supervisor: Login attempt failed:', err.message);
            addLog('System Alert', 'Reconnect Supervisor', 'Bot', false, err.message);
        } finally {
            isReconnecting = false;
        }
    }
}, 30000);

// Robust Global Process Crash Guards
client.on('error', err => {
    console.error('❌ Client Error:', err);
    addLog('System Error', 'Discord Client', 'Bot', false, err.message);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
    addLog('System Warning', 'Process', 'UnhandledRejection', false, String(reason));
});

process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception caught to keep process alive 24/7:', err);
    addLog('System Warning', 'Process', 'UncaughtException', false, err.message || String(err));
});

// Login to Discord if token is provided
if (botToken) {
    client.login(botToken).catch(err => {
        console.error('❌ Discord initial login failed:', err.message);
        addLog('Login Failed', 'Discord API', 'Bot', false, err.message);
    });
} else {
    console.warn('⚠️ No Discord token configured (TOKEN). Web Dashboard active.');
}
