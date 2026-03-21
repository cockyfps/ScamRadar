const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { colors, emojis } = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildBans
  ]
});

const PREFIX = process.env.PREFIX || '.';
const DB_PATH = path.join(__dirname, 'data', 'scammers.json');
const SERVERS_PATH = path.join(__dirname, 'data', 'servers.json');
const NP_PATH = path.join(__dirname, 'data', 'noprefix.json');
const TRUSTED_PATH = path.join(__dirname, 'data', 'trusted.json');
const EVIDENCE_PATH = path.join(__dirname, 'data', 'evidence.json');
const PREMIUM_PATH = path.join(__dirname, 'data', 'premium.json');
const SCANNER_PATH = path.join(__dirname, 'data', 'scanner.json');
const AUTOBAN_PATH = path.join(__dirname, 'data', 'autoban.json');

if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));

function loadDB() { if (!fs.existsSync(DB_PATH)) return {}; return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function saveDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }
function loadServers() { if (!fs.existsSync(SERVERS_PATH)) return {}; return JSON.parse(fs.readFileSync(SERVERS_PATH, 'utf8')); }
function saveServers(data) { fs.writeFileSync(SERVERS_PATH, JSON.stringify(data, null, 2)); }
function loadNP() { if (!fs.existsSync(NP_PATH)) return {}; return JSON.parse(fs.readFileSync(NP_PATH, 'utf8')); }
function saveNP(data) { fs.writeFileSync(NP_PATH, JSON.stringify(data, null, 2)); }
function loadTrusted() { if (!fs.existsSync(TRUSTED_PATH)) return {}; return JSON.parse(fs.readFileSync(TRUSTED_PATH, 'utf8')); }
function saveTrusted(data) { fs.writeFileSync(TRUSTED_PATH, JSON.stringify(data, null, 2)); }
function loadEvidence() { if (!fs.existsSync(EVIDENCE_PATH)) return {}; return JSON.parse(fs.readFileSync(EVIDENCE_PATH, 'utf8')); }
function saveEvidence(data) { fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(data, null, 2)); }
function loadPremium() { if (!fs.existsSync(PREMIUM_PATH)) return {}; return JSON.parse(fs.readFileSync(PREMIUM_PATH, 'utf8')); }
function savePremium(data) { fs.writeFileSync(PREMIUM_PATH, JSON.stringify(data, null, 2)); }
function loadScanner() { if (!fs.existsSync(SCANNER_PATH)) return {}; return JSON.parse(fs.readFileSync(SCANNER_PATH, 'utf8')); }
function saveScanner(data) { fs.writeFileSync(SCANNER_PATH, JSON.stringify(data, null, 2)); }
function loadAutoBan() { if (!fs.existsSync(AUTOBAN_PATH)) return {}; return JSON.parse(fs.readFileSync(AUTOBAN_PATH, 'utf8')); }
function saveAutoBan(data) { fs.writeFileSync(AUTOBAN_PATH, JSON.stringify(data, null, 2)); }

function isOwner(id) { return id === process.env.OWNER_ID; }
function isAdminOrOwner(id, member) { return isOwner(id) || member?.permissions.has(PermissionFlagsBits.Administrator); }
function isNP(id) { return !!loadNP()[id]; }
function canModerate(id, member) { return isAdminOrOwner(id, member) || isNP(id); }
function isPremium(id) {
  const p = loadPremium();
  if (!p[id]) return false;
  if (p[id].plan === 'lifetime') return true;
  return new Date(p[id].expiresAt) > new Date();
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

async function broadcastEmbed(embed, originChannelId) {
  const servers = loadServers();
  for (const [guildId, channelId] of Object.entries(servers)) {
    if (channelId === originChannelId) continue;
    try { const ch = await client.channels.fetch(channelId); if (ch) await ch.send({ embeds: [embed] }); } catch (e) {}
  }
}

// ─── Auto Ban in all servers ──────────────────────────────────────────────────

async function banInAllServers(userId, reason) {
  let banned = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      const me = guild.members.me;
      if (!me || !me.permissions.has(PermissionFlagsBits.BanMembers)) continue;
      await guild.bans.create(userId, { reason: `ScamRadar Auto-Ban: ${reason}` });
      banned++;
    } catch (e) {}
  }
  return banned;
}

// ─── Embeds ───────────────────────────────────────────────────────────────────

function scammerAlertEmbed(user, reason, reportedBy, reportedIn, count) {
  return new EmbedBuilder()
    .setTitle(`${emojis.scam_alert} | SCAMMER ALERT`)
    .setColor(colors.danger)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setDescription(`**${count}.** @${user.username} : \`${user.id}\` (${reason})`)
    .addFields(
      { name: `${emojis.user} User`, value: user.tag, inline: true },
      { name: `${emojis.dev_id} Developer ID`, value: `\`${user.id}\``, inline: true },
      { name: `${emojis.reason} Reason`, value: reason, inline: false },
      { name: `${emojis.reported_by} Reported By`, value: reportedBy.tag, inline: true },
      { name: `${emojis.reported_in} Reported In`, value: reportedIn, inline: true }
    )
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
}

function profileEmbed(user, record, evidence) {
  const isMarked = !!record;
  const isTrusted = !!loadTrusted()[user.id];
  let statusVal;
  if (isMarked) statusVal = `${emojis.marked} | **MARKED AS SCAMMER**`;
  else if (isTrusted) statusVal = `${emojis.clean} **Verified Trusted Seller**`;
  else statusVal = `${emojis.clean} **Clean • Not Marked**`;

  const eb = new EmbedBuilder()
    .setTitle(`${emojis.profile} ScamRadar Profile | ${user.tag}`)
    .setColor(isMarked ? colors.profile_marked : colors.profile_clean)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: `${emojis.user} Username`, value: user.tag, inline: true },
      { name: `${emojis.dev_id} Developer ID`, value: `\`${user.id}\``, inline: true },
      { name: `${emojis.action} Status`, value: statusVal, inline: false },
      ...(isMarked ? [
        { name: `${emojis.reason} Reason`, value: record.reason, inline: false },
        { name: `${emojis.marked_on} Marked On`, value: `<t:${Math.floor(new Date(record.markedAt).getTime() / 1000)}:F>`, inline: true },
        { name: `${emojis.marked_by} Marked By`, value: record.reportedByTag, inline: true }
      ] : [])
    )
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  if (evidence && evidence.length > 0) {
    eb.addFields({ name: `📎 Evidence (${evidence.length})`, value: evidence.map((e, i) => `**${i+1}.** [Link](${e.url}) — <t:${Math.floor(new Date(e.addedAt).getTime()/1000)}:d>`).join('\n'), inline: false });
  }
  return eb;
}

function scammerListEmbed(scammers, page = 1) {
  const perPage = 10;
  const entries = Object.entries(scammers);
  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  page = Math.min(page, totalPages);
  const slice = entries.slice((page - 1) * perPage, page * perPage);
  const embed = new EmbedBuilder()
    .setTitle(`${emojis.list} ScamRadar — Scammer List`)
    .setColor(colors.warning)
    .setFooter({ text: `Page ${page}/${totalPages} • ${entries.length} total scammers • ScamRadar`, iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
  if (slice.length === 0) { embed.setDescription(`${emojis.success} | No scammers have been marked yet.`); }
  else {
    embed.setDescription(slice.map(([id, r], i) =>
      `**${(page-1)*perPage+i+1}.** \`${id}\` — **${r.tag}**\n> ${emojis.reason} ${r.reason} | ${emojis.marked_on} <t:${Math.floor(new Date(r.markedAt).getTime()/1000)}:d>`
    ).join('\n\n'));
  }
  return embed;
}

function unmarkEmbed(user, removedBy) {
  return new EmbedBuilder()
    .setTitle(`${emojis.unmark} | Scammer Removed From The Scammer List`)
    .setColor(colors.success)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: `${emojis.user} User`, value: user.tag, inline: true },
      { name: `${emojis.dev_id} Developer ID`, value: `\`${user.id}\``, inline: true },
      { name: `${emojis.action} Action`, value: 'Removed from scammer list', inline: false },
      { name: `${emojis.removed_by} Removed By`, value: removedBy.tag, inline: true }
    )
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
}

function npListEmbed(npUsers) {
  const entries = Object.entries(npUsers);
  const embed = new EmbedBuilder()
    .setTitle(`${emojis.np_title} No Prefix List`)
    .setColor(colors.info)
    .setFooter({ text: `${entries.length} users • ScamRadar`, iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
  if (entries.length === 0) { embed.setDescription('No users in the no prefix list yet.'); }
  else { embed.setDescription(entries.map(([id, d], i) => `**${i+1}.** **${d.tag}**\n> ${emojis.dev_id} \`${id}\``).join('\n\n')); }
  return embed;
}

function statsEmbed() {
  const scammers = loadDB();
  const servers = loadServers();
  const trusted = loadTrusted();
  const premium = loadPremium();
  const totalUsers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  return new EmbedBuilder()
    .setTitle(`📊 ScamRadar — Stats`)
    .setColor(colors.info)
    .addFields(
      { name: '🚨 Scammers Marked', value: `\`${Object.keys(scammers).length}\``, inline: true },
      { name: '🌐 Connected Servers', value: `\`${Object.keys(servers).length}\``, inline: true },
      { name: '✅ Trusted Sellers', value: `\`${Object.keys(trusted).length}\``, inline: true },
      { name: '👥 Users Protected', value: `\`${totalUsers.toLocaleString()}\``, inline: true },
      { name: '💎 Premium Users', value: `\`${Object.keys(premium).length}\``, inline: true },
      { name: '🏓 Ping', value: `\`${client.ws.ping}ms\``, inline: true },
      { name: '⏱️ Uptime', value: `\`${Math.floor(client.uptime/3600000)}h ${Math.floor((client.uptime%3600000)/60000)}m\``, inline: true }
    )
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
}

function recentEmbed(scammers) {
  const entries = Object.entries(scammers);
  const recent = entries.sort((a, b) => new Date(b[1].markedAt) - new Date(a[1].markedAt)).slice(0, 5);
  const embed = new EmbedBuilder()
    .setTitle(`🕐 ScamRadar — Recently Marked`)
    .setColor(colors.warning)
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
  if (recent.length === 0) { embed.setDescription(`${emojis.success} | No scammers have been marked yet.`); }
  else {
    embed.setDescription(recent.map(([id, r], i) =>
      `**${i+1}.** **${r.tag}** \`${id}\`\n> ${emojis.reason} ${r.reason} | <t:${Math.floor(new Date(r.markedAt).getTime()/1000)}:R>`
    ).join('\n\n'));
  }
  return embed;
}

// ─── Command Handlers ─────────────────────────────────────────────────────────

async function handleMark(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!canModerate(authorId, interaction.member)) {
    const msg = `${emojis.error} | **You need Administrator permission to mark scammers.**`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  let targetId, reason;
  if (isSlash) { const t = interaction.options.getUser('user'); reason = interaction.options.getString('reason'); targetId = t.id; }
  else { targetId = args[0]?.replace(/[<@!>]/g, ''); reason = args.slice(1).join(' '); }
  if (!targetId || !reason) {
    const msg = `${emojis.error} | **Usage: \`mark @user <reason>\`**`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  let targetUser;
  try { targetUser = await client.users.fetch(targetId); } catch {
    const msg = `${emojis.error} | Could not find that user.`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  const db = loadDB();
  if (db[targetId]) {
    const msg = `${emojis.warning} | **${targetUser.tag}** is already marked. Use \`unmark\` first.`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  db[targetId] = { tag: targetUser.tag, reason, markedAt: new Date().toISOString(), reportedById: isSlash ? interaction.user.id : interaction.author.id, reportedByTag: isSlash ? interaction.user.tag : interaction.author.tag, reportedIn: interaction.guild?.name || 'Unknown' };
  saveDB(db);
  const count = Object.keys(db).length;
  const reporter = isSlash ? interaction.user : interaction.author;
  const guildName = interaction.guild?.name || 'Unknown Server';
  const embed = scammerAlertEmbed(targetUser, reason, reporter, guildName, count);
  const confirmMsg = `${emojis.success} | **Marked!** Alert sent to all connected servers.`;
  if (isSlash) { await interaction.reply({ content: confirmMsg, ephemeral: true }); await interaction.channel.send({ embeds: [embed] }); }
  else { await interaction.reply(confirmMsg); await interaction.channel.send({ embeds: [embed] }); }
  await broadcastEmbed(embed, interaction.channel?.id);
  // Auto ban in all servers
  const banned = await banInAllServers(targetId, reason);
  if (banned > 0) {
    const banMsg = `${emojis.success} | Auto-banned **${targetUser.tag}** in **${banned}** server(s).`;
    if (isSlash) await interaction.followUp({ content: banMsg, ephemeral: true });
    else await interaction.channel.send(banMsg);
  }
}

async function handleUnmark(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!canModerate(authorId, interaction.member)) {
    const msg = `${emojis.error} | **You need Administrator permission to unmark users.**`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  let targetId;
  if (isSlash) { targetId = interaction.options.getUser('user').id; } else { targetId = args[0]?.replace(/[<@!>]/g, ''); }
  if (!targetId) { const msg = `${emojis.error} | Please provide a user to unmark.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const db = loadDB();
  if (!db[targetId]) { const msg = `${emojis.warning} | That user is not in the scammer list.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const targetUser = await client.users.fetch(targetId).catch(() => null);
  delete db[targetId]; saveDB(db);
  const ev = loadEvidence(); delete ev[targetId]; saveEvidence(ev);
  const remover = isSlash ? interaction.user : interaction.author;
  if (targetUser) {
    const embed = unmarkEmbed(targetUser, remover);
    if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
    await broadcastEmbed(embed, interaction.channel?.id);
  } else {
    const msg = `${emojis.success} | User \`${targetId}\` removed from the scammer list.`;
    if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
  }
}

async function handleProfile(interaction, args, isSlash) {
  let targetId;
  if (isSlash) { const u = interaction.options.getUser('user', false); const id = interaction.options.getString('id', false); targetId = u?.id || id; }
  else { targetId = args[0]?.replace(/[<@!>]/g, ''); }
  if (!targetId) { const msg = `${emojis.error} | Usage: \`profile @user\` or \`profile <ID>\``; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  if (isSlash) await interaction.deferReply();
  let targetUser;
  try { targetUser = await client.users.fetch(targetId); } catch { const msg = `${emojis.error} | Could not find that user.`; return isSlash ? interaction.editReply(msg) : interaction.reply(msg); }
  const db = loadDB(); const ev = loadEvidence();
  const embed = profileEmbed(targetUser, db[targetId] || null, ev[targetId] || []);
  if (isSlash) await interaction.editReply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleScammerList(interaction, args, isSlash) {
  const page = isSlash ? (interaction.options.getInteger('page') || 1) : (parseInt(args[0]) || 1);
  const embed = scammerListEmbed(loadDB(), page);
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleSetChannel(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!canModerate(authorId, interaction.member)) {
    const msg = `${emojis.error} | **You need Administrator permission to set the alert channel.**`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  const channelId = isSlash ? interaction.options.getChannel('channel').id : interaction.mentions.channels.first()?.id;
  if (!channelId) { const msg = `${emojis.error} | Usage: \`setchannel #channel\``; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const servers = loadServers(); servers[interaction.guild.id] = channelId; saveServers(servers);
  const msg = `${emojis.success} | Alert channel set to <#${channelId}>! This server will now receive scam alerts.`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handleRemoveChannel(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!canModerate(authorId, interaction.member)) {
    const msg = `${emojis.error} | **You need Administrator permission.**`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  const servers = loadServers();
  if (!servers[interaction.guild.id]) { const msg = `${emojis.warning} | This server has no alert channel set.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  delete servers[interaction.guild.id]; saveServers(servers);
  const msg = `${emojis.success} | Alert channel removed. This server will no longer receive scam alerts.`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handleStats(interaction, isSlash) {
  const embed = statsEmbed();
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleRecent(interaction, isSlash) {
  const embed = recentEmbed(loadDB());
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleSearch(interaction, args, isSlash) {
  const keyword = isSlash ? interaction.options.getString('keyword') : args.join(' ');
  if (!keyword) { const msg = `${emojis.error} | Usage: \`search <keyword>\``; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const db = loadDB();
  const results = Object.entries(db).filter(([id, r]) => r.reason.toLowerCase().includes(keyword.toLowerCase()) || r.tag.toLowerCase().includes(keyword.toLowerCase()));
  const embed = new EmbedBuilder()
    .setTitle(`🔎 Search Results — "${keyword}"`)
    .setColor(colors.info)
    .setFooter({ text: `${results.length} result(s) • ScamRadar`, iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
  if (results.length === 0) { embed.setDescription(`${emojis.warning} | No results found for **${keyword}**.`); }
  else { embed.setDescription(results.slice(0, 10).map(([id, r], i) => `**${i+1}.** **${r.tag}** \`${id}\`\n> ${emojis.reason} ${r.reason}`).join('\n\n')); }
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleVerify(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!canModerate(authorId, interaction.member)) { const msg = `${emojis.error} | **You need Administrator permission.**`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  let targetId;
  if (isSlash) { targetId = interaction.options.getUser('user').id; } else { targetId = args[0]?.replace(/[<@!>]/g, ''); }
  if (!targetId) { return interaction.reply(`${emojis.error} | Usage: \`verify @user\``); }
  let targetUser;
  try { targetUser = await client.users.fetch(targetId); } catch { return interaction.reply(`${emojis.error} | Could not find that user.`); }
  const db = loadDB();
  if (db[targetId]) { const msg = `${emojis.error} | Cannot verify a marked scammer.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const trusted = loadTrusted();
  if (trusted[targetId]) { const msg = `${emojis.warning} | **${targetUser.tag}** is already verified.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  trusted[targetId] = { tag: targetUser.tag, verifiedAt: new Date().toISOString(), verifiedByTag: isSlash ? interaction.user.tag : interaction.author.tag };
  saveTrusted(trusted);
  const embed = new EmbedBuilder()
    .setTitle(`${emojis.clean} Verified Trusted Seller`)
    .setColor(colors.success)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields({ name: `${emojis.user} User`, value: targetUser.tag, inline: true }, { name: `${emojis.dev_id} Developer ID`, value: `\`${targetId}\``, inline: true }, { name: `${emojis.success} Status`, value: 'Marked as Trusted Seller', inline: false }, { name: `${emojis.marked_by} Verified By`, value: isSlash ? interaction.user.tag : interaction.author.tag, inline: true })
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() }).setTimestamp();
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleUnverify(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!canModerate(authorId, interaction.member)) { const msg = `${emojis.error} | **You need Administrator permission.**`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  let targetId;
  if (isSlash) { targetId = interaction.options.getUser('user').id; } else { targetId = args[0]?.replace(/[<@!>]/g, ''); }
  if (!targetId) { return interaction.reply(`${emojis.error} | Usage: \`unverify @user\``); }
  const trusted = loadTrusted();
  if (!trusted[targetId]) { return interaction.reply(`${emojis.warning} | That user is not verified.`); }
  const tag = trusted[targetId].tag; delete trusted[targetId]; saveTrusted(trusted);
  const msg = `${emojis.success} | **${tag}** has been unverified.`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handleEvidence(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!canModerate(authorId, interaction.member)) { const msg = `${emojis.error} | **You need Administrator permission.**`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  let targetId, url;
  if (isSlash) { targetId = interaction.options.getUser('user').id; url = interaction.options.getString('url'); }
  else { targetId = args[0]?.replace(/[<@!>]/g, ''); url = args[1]; }
  if (!targetId || !url) { const msg = `${emojis.error} | Usage: \`evidence @user <url>\``; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const db = loadDB();
  if (!db[targetId]) { const msg = `${emojis.warning} | That user is not in the scammer list.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const ev = loadEvidence();
  if (!ev[targetId]) ev[targetId] = [];
  ev[targetId].push({ url, addedAt: new Date().toISOString(), addedByTag: isSlash ? interaction.user.tag : interaction.author.tag });
  saveEvidence(ev);
  const msg = `${emojis.success} | Evidence added. Total: **${ev[targetId].length}** link(s).`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handlePing(interaction, isSlash) {
  const embed = new EmbedBuilder()
    .setTitle('🏓 Pong!')
    .setColor(colors.info)
    .addFields({ name: '📡 Websocket Ping', value: `\`${client.ws.ping}ms\``, inline: true }, { name: '⏱️ Uptime', value: `\`${Math.floor(client.uptime/3600000)}h ${Math.floor((client.uptime%3600000)/60000)}m ${Math.floor((client.uptime%60000)/1000)}s\``, inline: true })
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() }).setTimestamp();
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

// ─── Scanner System ───────────────────────────────────────────────────────────

async function handleSetScanner(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!isOwner(authorId)) { const msg = `${emojis.error} | Only the bot owner can set the scanner channel.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const channelId = isSlash ? interaction.options.getChannel('channel').id : interaction.mentions.channels.first()?.id;
  if (!channelId) { const msg = `${emojis.error} | Usage: \`setscanner #channel\``; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const scanner = loadScanner(); scanner.channelId = channelId; saveScanner(scanner);
  const msg = `${emojis.success} | Scanner channel set to <#${channelId}>! The bot will now scan messages there for Discord IDs and auto-add them to the database.`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handleScanNow(message, args) {
  if (!isOwner(message.author.id)) return message.reply(`${emojis.error} | Only the bot owner can run manual scans.`);
  const scanner = loadScanner();
  if (!scanner.channelId) return message.reply(`${emojis.error} | No scanner channel set. Use \`setscanner #channel\` first.`);
  const reason = args.join(' ') || 'Imported from blacklist channel';
  try {
    const ch = await client.channels.fetch(scanner.channelId);
    let added = 0; let skipped = 0;
    const db = loadDB();
    let lastId;
    while (true) {
      const opts = { limit: 100 };
      if (lastId) opts.before = lastId;
      const msgs = await ch.messages.fetch(opts);
      if (msgs.size === 0) break;
      for (const msg of msgs.values()) {
        const ids = msg.content.match(/\b\d{17,19}\b/g) || [];
        for (const id of ids) {
          if (db[id]) { skipped++; continue; }
          try {
            const user = await client.users.fetch(id);
            db[id] = { tag: user.tag, reason, markedAt: new Date().toISOString(), reportedById: process.env.OWNER_ID, reportedByTag: 'ScamRadar Scanner', reportedIn: 'Scanner Import' };
            added++;
          } catch (e) { skipped++; }
        }
      }
      lastId = msgs.last()?.id;
      if (msgs.size < 100) break;
    }
    saveDB(db);
    return message.reply(`${emojis.success} | Scan complete! **${added}** users added to database. **${skipped}** skipped (already marked or invalid).`);
  } catch (e) {
    return message.reply(`${emojis.error} | Failed to scan channel: ${e.message}`);
  }
}

// ─── Auto Ban Toggle ──────────────────────────────────────────────────────────

async function handleAutoBan(message, args) {
  if (!isOwner(message.author.id)) return message.reply(`${emojis.error} | Only the bot owner can toggle auto-ban.`);
  const ab = loadAutoBan();
  ab.enabled = !ab.enabled;
  saveAutoBan(ab);
  return message.reply(`${emojis.success} | Auto-ban is now **${ab.enabled ? 'ENABLED' : 'DISABLED'}**. When a marked scammer is detected joining any server where the bot has ban permissions, they will be automatically banned.`);
}

// ─── Premium System ───────────────────────────────────────────────────────────

function generateCode(userId, plan) {
  const raw = `${userId}-${plan}-${Date.now()}-${Math.random()}`;
  return 'SR-' + crypto.createHash('md5').update(raw).digest('hex').toUpperCase().slice(0, 12);
}

async function handlePremium(interaction, args, isSlash) {
  const sub = isSlash ? interaction.options.getSubcommand() : args[0]?.toLowerCase();
  const authorId = isSlash ? interaction.user.id : interaction.author.id;

  // .premium view
  if (sub === 'view') {
    const embed = new EmbedBuilder()
      .setTitle('💎 ScamRadar Premium')
      .setColor(0xFFD700)
      .setDescription('Unlock exclusive features with ScamRadar Premium!')
      .addFields(
        { name: '⭐ Monthly — $4.99/month', value: '• No prefix commands\n• Priority support\n• Premium badge in profile', inline: false },
        { name: '👑 Lifetime — $9.99 one time', value: '• Everything in Monthly\n• Lifetime access, never expires\n• Early access to new features', inline: false },
        { name: '💳 How to Buy', value: `Send payment to **paypal.me/${process.env.PAYPAL_ME || 'yourpaypal'}**\nThen run \`.premium buy <monthly/lifetime>\` and follow the steps.`, inline: false }
      )
      .setFooter({ text: 'ScamRadar Premium • Thank you for supporting!', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();
    if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
    return;
  }

  // .premium buy
  if (sub === 'buy') {
    const plan = isSlash ? interaction.options.getString('plan') : args[1]?.toLowerCase();
    if (!plan || !['monthly', 'lifetime'].includes(plan)) {
      const msg = `${emojis.error} | Usage: \`premium buy monthly\` or \`premium buy lifetime\``;
      return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
    }
    const price = plan === 'monthly' ? '$4.99' : '$9.99';
    const embed = new EmbedBuilder()
      .setTitle(`💎 Purchase ScamRadar Premium — ${plan.charAt(0).toUpperCase() + plan.slice(1)}`)
      .setColor(0xFFD700)
      .setDescription(`**Price:** ${price}\n\n**Step 1:** Send **${price}** to:\n> 💳 **paypal.me/${process.env.PAYPAL_ME || 'yourpaypal'}**\n\n**Step 2:** In the PayPal note write your Discord ID:\n> \`${authorId}\`\n\n**Step 3:** DM the bot owner with your payment screenshot\n\n**Step 4:** You'll receive an activation code to use with:\n> \`.premium activate <code>\``)
      .setFooter({ text: 'ScamRadar Premium • Payment is manual, allow up to 24h for verification', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();
    if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
    return;
  }

  // .premium generate (owner only — generate a code after payment verified)
  if (sub === 'generate') {
    if (!isOwner(authorId)) { const msg = `${emojis.error} | Only the bot owner can generate premium codes.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
    const targetId = isSlash ? interaction.options.getString('userid') : args[1];
    const plan = isSlash ? interaction.options.getString('plan') : args[2]?.toLowerCase();
    if (!targetId || !plan || !['monthly', 'lifetime'].includes(plan)) {
      const msg = `${emojis.error} | Usage: \`premium generate <userID> <monthly/lifetime>\``;
      return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
    }
    const code = generateCode(targetId, plan);
    const premium = loadPremium();
    if (!premium._codes) premium._codes = {};
    premium._codes[code] = { userId: targetId, plan, createdAt: new Date().toISOString() };
    savePremium(premium);
    const msg = `${emojis.success} | Code generated for \`${targetId}\`:\n\`\`\`${code}\`\`\`\nPlan: **${plan}**\nSend this code to the user to activate with \`.premium activate ${code}\``;
    if (isSlash) await interaction.reply({ content: msg, ephemeral: true }); else await interaction.reply(msg);
    return;
  }

  // .premium activate
  if (sub === 'activate') {
    const code = isSlash ? interaction.options.getString('code') : args[1];
    if (!code) { const msg = `${emojis.error} | Usage: \`premium activate <code>\``; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
    const premium = loadPremium();
    const codeData = premium._codes?.[code];
    if (!codeData) { const msg = `${emojis.error} | Invalid or already used code.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
    if (codeData.userId !== authorId) { const msg = `${emojis.error} | This code was not generated for your account.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
    const expiresAt = codeData.plan === 'lifetime' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    premium[authorId] = { plan: codeData.plan, activatedAt: new Date().toISOString(), expiresAt };
    delete premium._codes[code];
    savePremium(premium);
    const embed = new EmbedBuilder()
      .setTitle('💎 Premium Activated!')
      .setColor(0xFFD700)
      .addFields(
        { name: '👑 Plan', value: codeData.plan.charAt(0).toUpperCase() + codeData.plan.slice(1), inline: true },
        { name: '📅 Activated', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true },
        { name: '⏳ Expires', value: expiresAt ? `<t:${Math.floor(new Date(expiresAt).getTime()/1000)}:F>` : '**Never (Lifetime)**', inline: true }
      )
      .setFooter({ text: 'ScamRadar Premium • Thank you for supporting!', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();
    if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
    return;
  }

  // .premium status
  if (sub === 'status') {
    const premium = loadPremium();
    const record = premium[authorId];
    if (!record || (record.plan !== 'lifetime' && new Date(record.expiresAt) < new Date())) {
      const embed = new EmbedBuilder()
        .setTitle('💎 Premium Status')
        .setColor(colors.info)
        .setDescription(`${emojis.marked} | You do not have an active premium plan.\nRun \`.premium view\` to see plans.`)
        .setFooter({ text: 'ScamRadar Premium', iconURL: client.user.displayAvatarURL() }).setTimestamp();
      if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle('💎 Your Premium Status')
      .setColor(0xFFD700)
      .addFields(
        { name: '👑 Plan', value: record.plan.charAt(0).toUpperCase() + record.plan.slice(1), inline: true },
        { name: '📅 Activated', value: `<t:${Math.floor(new Date(record.activatedAt).getTime()/1000)}:F>`, inline: true },
        { name: '⏳ Expires', value: record.plan === 'lifetime' ? '**Never (Lifetime)**' : `<t:${Math.floor(new Date(record.expiresAt).getTime()/1000)}:R>`, inline: true }
      )
      .setFooter({ text: 'ScamRadar Premium • Thank you for supporting!', iconURL: client.user.displayAvatarURL() }).setTimestamp();
    if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
    return;
  }

  const msg = `${emojis.error} | Usage: \`premium view\` | \`premium buy\` | \`premium activate <code>\` | \`premium status\``;
  if (isSlash) await interaction.reply({ content: msg, ephemeral: true }); else await interaction.reply(msg);
}

// ─── NP & Eval ────────────────────────────────────────────────────────────────

async function handleNP(message, args) {
  if (!isOwner(message.author.id)) return message.reply(`${emojis.error} | Only the bot owner can manage the no prefix list.`);
  const sub = args[0]?.toLowerCase();
  if (sub === 'add') {
    const targetId = args[1]?.replace(/[<@!>]/g, '');
    if (!targetId) return message.reply(`${emojis.error} | Usage: \`np add @user\` or \`np add <ID>\``);
    let targetUser;
    try { targetUser = await client.users.fetch(targetId); } catch { return message.reply(`${emojis.error} | Could not find that user.`); }
    const np = loadNP();
    if (np[targetId]) return message.reply(`${emojis.warning} **${targetUser.tag}** | is already in the no prefix list.`);
    np[targetId] = { tag: targetUser.tag, addedAt: new Date().toISOString() }; saveNP(np);
    return message.channel.send({ embeds: [
      new EmbedBuilder().setTitle(`${emojis.np_title} No Prefix • User Added`).setColor(colors.success)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields({ name: `${emojis.user} User`, value: targetUser.tag, inline: true }, { name: `${emojis.dev_id} Developer ID`, value: `\`${targetId}\``, inline: true }, { name: `${emojis.np_added} Status`, value: ' • Can now use commands without prefix', inline: false })
        .setFooter({ text: 'ScamRadar • No Prefix System', iconURL: client.user.displayAvatarURL() }).setTimestamp()
    ]});
  }
  if (sub === 'remove') {
    const targetId = args[1]?.replace(/[<@!>]/g, '');
    if (!targetId) return message.reply(`${emojis.error} | Usage: \`np remove @user\` or \`np remove <ID>\``);
    const np = loadNP();
    if (!np[targetId]) return message.reply(`${emojis.warning} | That user is not in the no prefix list.`);
    const tag = np[targetId].tag; delete np[targetId]; saveNP(np);
    return message.channel.send({ embeds: [
      new EmbedBuilder().setTitle(`${emojis.np_title} No Prefix • User Removed`).setColor(colors.danger)
        .addFields({ name: `${emojis.user} User`, value: tag, inline: true }, { name: `${emojis.dev_id} Developer ID`, value: `\`${targetId}\``, inline: true }, { name: `${emojis.np_removed} Status`, value: 'Removed from no prefix list', inline: false })
        .setFooter({ text: 'ScamRadar • No Prefix System', iconURL: client.user.displayAvatarURL() }).setTimestamp()
    ]});
  }
  if (sub === 'list') return message.channel.send({ embeds: [npListEmbed(loadNP())] });
  return message.reply(`${emojis.error} | Usage: \`np add @user\` | \`np remove @user\` | \`np list\``);
}

async function handleEval(message, args) {
  if (!isOwner(message.author.id)) return message.reply(`${emojis.error} | **Only the bot owner can use eval.**`);
  const code = args.join(' ');
  if (!code) return message.reply(`${emojis.error} | Usage: \`eval <code>\``);
  try {
    let result = eval(code);
    if (result instanceof Promise) result = await result;
    if (typeof result !== 'string') result = require('util').inspect(result, { depth: 2 });
    result = result.replace(new RegExp(process.env.TOKEN, 'g'), '[TOKEN HIDDEN]');
    if (result.length > 1900) result = result.slice(0, 1900) + '\n... (truncated)';
    return message.channel.send({ embeds: [new EmbedBuilder().setTitle('Eval • Output').setColor(colors.success).addFields({ name: '📥 Input', value: `\`\`\`js\n${code.slice(0, 900)}\n\`\`\`` }, { name: '📤 Output', value: `\`\`\`js\n${result}\n\`\`\`` }).setFooter({ text: 'ScamRadar • Eval', iconURL: client.user.displayAvatarURL() }).setTimestamp()]});
  } catch (err) {
    return message.channel.send({ embeds: [new EmbedBuilder().setTitle('⚙️ Eval • Error').setColor(colors.danger).addFields({ name: '📥 Input', value: `\`\`\`js\n${code.slice(0, 900)}\n\`\`\`` }, { name: '❌ Error', value: `\`\`\`js\n${err.message}\n\`\`\`` }).setFooter({ text: 'ScamRadar • Eval', iconURL: client.user.displayAvatarURL() }).setTimestamp()]});
  }
}

async function handleSh(message, args) {
  if (!isOwner(message.author.id)) return message.reply(`${emojis.error} | **Only the bot owner can use sh.**`);
  const cmd = args.join(' ');
  if (!cmd) return message.reply(`${emojis.error} | Usage: \`sh <command>\``);
  const { exec } = require('child_process');
  exec(cmd, { timeout: 10000 }, async (err, stdout, stderr) => {
    const output = (stdout || stderr || 'No output.').slice(0, 1900);
    return message.channel.send({ embeds: [new EmbedBuilder().setTitle('🖥️ Shell • Output').setColor(colors.info).addFields({ name: '📥 Command', value: `\`\`\`sh\n${cmd}\n\`\`\`` }, { name: err ? '❌ Error' : '📤 Output', value: `\`\`\`sh\n${output}\n\`\`\`` }).setFooter({ text: 'ScamRadar • Shell', iconURL: client.user.displayAvatarURL() }).setTimestamp()]});
  });
}

async function handleHelp(interaction, isSlash) {
  const embed = new EmbedBuilder()
    .setTitle(`${emojis.help_title} **Command List**`)
    .setColor(colors.info)
    .setDescription(' • Made with ❤️ by Forkie')
    .addFields(
      { name: `${emojis.cmd_mark} Mark a Scammer`, value: '`mark @user <reason>` or `/mark`\n> Owner & Admins only.' },
      { name: `${emojis.cmd_unmark} Unmark a User`, value: '`unmark @user` or `/unmark`\n> Owner & Admins only.' },
      { name: `${emojis.cmd_profile} Profile Lookup`, value: '`profile @user or <ID>` or `/profile`\n> Anyone can use.' },
      { name: `${emojis.cmd_list} Scammer List`, value: '`sl [page]` or `scammerlist [page]` or `/sl`\n> Anyone can use.' },
      { name: `${emojis.cmd_channel} Set Alert Channel`, value: '`setchannel #channel` or `/setchannel`\n> Admins & Owner only.' },
      { name: `${emojis.cmd_channel} Remove Alert Channel`, value: '`removechannel` or `/removechannel`\n> Admins & Owner only.' },
      { name: `📊 Stats`, value: '`stats` or `/stats`\n> Anyone can use.' },
      { name: `🕐 Recent`, value: '`recent` or `/recent`\n> Shows last 5 marked scammers.' },
      { name: `🔎 Search`, value: '`search <keyword>` or `/search`\n> Search scammer list by name or reason.' },
      { name: `${emojis.clean} Verify Seller`, value: '`verify @user` or `/verify`\n> Mark a user as trusted seller.' },
      { name: `${emojis.marked} Unverify Seller`, value: '`unverify @user` or `/unverify`\n> Remove trusted status.' },
      { name: `📎 Add Evidence`, value: '`evidence @user <url>` or `/evidence`\n> Attach proof to a scammer.' },
      { name: `🏓 Ping`, value: '`ping` or `/ping`\n> Check bot ping and uptime.' },
      { name: `💎 Premium`, value: '`premium view` | `premium buy` | `premium activate <code>` | `premium status`' },
      { name: `${emojis.cmd_np} No Prefix System`, value: '`np add @user` | `np remove @user` | `np list`\n> Bot Developer only.' }
    )
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() });
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

// ─── Slash Commands ───────────────────────────────────────────────────────────

const slashCommands = [
  new SlashCommandBuilder().setName('mark').setDescription('Mark a user as a scammer')
    .addUserOption(o => o.setName('user').setDescription('User to mark').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('unmark').setDescription('Remove a user from the scammer list')
    .addUserOption(o => o.setName('user').setDescription('User to unmark').setRequired(true)),
  new SlashCommandBuilder().setName('profile').setDescription("Look up a user's scammer status")
    .addUserOption(o => o.setName('user').setDescription('Mention a user').setRequired(false))
    .addStringOption(o => o.setName('id').setDescription('Or enter a Discord ID').setRequired(false)),
  new SlashCommandBuilder().setName('sl').setDescription('View the full scammer list')
    .addIntegerOption(o => o.setName('page').setDescription('Page number').setRequired(false)),
  new SlashCommandBuilder().setName('setchannel').setDescription('Set the alert channel')
    .addChannelOption(o => o.setName('channel').setDescription('Alert channel').setRequired(true)),
  new SlashCommandBuilder().setName('removechannel').setDescription('Remove this server from scam alerts'),
  new SlashCommandBuilder().setName('setscanner').setDescription('Set channel to scan for blacklist IDs (owner only)')
    .addChannelOption(o => o.setName('channel').setDescription('Scanner channel').setRequired(true)),
  new SlashCommandBuilder().setName('stats').setDescription('View ScamRadar stats'),
  new SlashCommandBuilder().setName('recent').setDescription('View recently marked scammers'),
  new SlashCommandBuilder().setName('search').setDescription('Search the scammer list')
    .addStringOption(o => o.setName('keyword').setDescription('Search keyword').setRequired(true)),
  new SlashCommandBuilder().setName('verify').setDescription('Mark a user as a trusted seller')
    .addUserOption(o => o.setName('user').setDescription('User to verify').setRequired(true)),
  new SlashCommandBuilder().setName('unverify').setDescription('Remove trusted status from a user')
    .addUserOption(o => o.setName('user').setDescription('User to unverify').setRequired(true)),
  new SlashCommandBuilder().setName('evidence').setDescription('Add evidence link to a scammer')
    .addUserOption(o => o.setName('user').setDescription('Scammer user').setRequired(true))
    .addStringOption(o => o.setName('url').setDescription('Evidence URL').setRequired(true)),
  new SlashCommandBuilder().setName('ping').setDescription('Check bot ping and uptime'),
  new SlashCommandBuilder().setName('premium').setDescription('ScamRadar Premium commands')
    .addSubcommand(s => s.setName('view').setDescription('View premium plans'))
    .addSubcommand(s => s.setName('buy').setDescription('Buy premium').addStringOption(o => o.setName('plan').setDescription('Plan').setRequired(true).addChoices({ name: 'Monthly - $4.99', value: 'monthly' }, { name: 'Lifetime - $9.99', value: 'lifetime' })))
    .addSubcommand(s => s.setName('activate').setDescription('Activate a premium code').addStringOption(o => o.setName('code').setDescription('Your code').setRequired(true)))
    .addSubcommand(s => s.setName('status').setDescription('Check your premium status'))
    .addSubcommand(s => s.setName('generate').setDescription('Generate a code (owner only)').addStringOption(o => o.setName('userid').setDescription('User ID').setRequired(true)).addStringOption(o => o.setName('plan').setDescription('Plan').setRequired(true).addChoices({ name: 'Monthly', value: 'monthly' }, { name: 'Lifetime', value: 'lifetime' }))),
  new SlashCommandBuilder().setName('help').setDescription('Show all ScamRadar commands')
].map(cmd => cmd.toJSON());

// ─── Ready ────────────────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`✅ ScamRadar is online as ${client.user.tag}`);
  client.user.setActivity('📡 Scanning for scammers | .help', { type: 3 });
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try { await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands }); console.log('✅ Slash commands registered globally.'); }
  catch (err) { console.error('❌ Failed to register slash commands:', err); }
});

// ─── Auto scanner — reads new messages in scanner channel ────────────────────

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const scanner = loadScanner();
  if (scanner.channelId && message.channel.id === scanner.channelId && !message.content.startsWith(PREFIX)) {
    const ids = message.content.match(/\b\d{17,19}\b/g) || [];
    const db = loadDB();
    let added = 0;
    for (const id of ids) {
      if (db[id]) continue;
      try {
        const user = await client.users.fetch(id);
        db[id] = { tag: user.tag, reason: 'Imported from blacklist channel', markedAt: new Date().toISOString(), reportedById: process.env.OWNER_ID, reportedByTag: 'ScamRadar Scanner', reportedIn: message.guild?.name || 'Scanner' };
        added++;
        await banInAllServers(id, 'Imported from blacklist channel');
      } catch (e) {}
    }
    if (added > 0) { saveDB(db); await message.react('✅'); }
    return;
  }

  // Normal prefix handler
  const content = message.content.trim();
  const authorId = message.author.id;
  const hasPrefix = content.startsWith(PREFIX);
  if (!hasPrefix && !isNP(authorId) && !isOwner(authorId)) return;
  const raw = hasPrefix ? content.slice(PREFIX.length).trim() : content.trim();
  const args = raw.split(/\s+/);
  const cmd = args.shift().toLowerCase();
  if (cmd === 'mark') await handleMark(message, args, false);
  else if (cmd === 'unmark') await handleUnmark(message, args, false);
  else if (cmd === 'profile') await handleProfile(message, args, false);
  else if (cmd === 'sl' || cmd === 'scammerlist') await handleScammerList(message, args, false);
  else if (cmd === 'setchannel') await handleSetChannel(message, args, false);
  else if (cmd === 'removechannel') await handleRemoveChannel(message, args, false);
  else if (cmd === 'setscanner') await handleSetScanner(message, args, false);
  else if (cmd === 'scannow') await handleScanNow(message, args);
  else if (cmd === 'autoban') await handleAutoBan(message, args);
  else if (cmd === 'stats') await handleStats(message, false);
  else if (cmd === 'recent') await handleRecent(message, false);
  else if (cmd === 'search') await handleSearch(message, args, false);
  else if (cmd === 'verify') await handleVerify(message, args, false);
  else if (cmd === 'unverify') await handleUnverify(message, args, false);
  else if (cmd === 'evidence') await handleEvidence(message, args, false);
  else if (cmd === 'ping') await handlePing(message, false);
  else if (cmd === 'premium') await handlePremium(message, args, false);
  else if (cmd === 'help' || cmd === 'scamradar') await handleHelp(message, false);
  else if (cmd === 'np') await handleNP(message, args);
  else if (cmd === 'eval') await handleEval(message, args);
  else if (cmd === 'sh') await handleSh(message, args);
});

// ─── Auto-detect & ban marked user joining ────────────────────────────────────

client.on('guildMemberAdd', async member => {
  const db = loadDB();
  if (!db[member.id]) return;
  const servers = loadServers();
  const channelId = servers[member.guild.id];
  const record = db[member.id];
  const ab = loadAutoBan();

  // Auto ban if enabled and bot has permission
  if (ab.enabled) {
    try {
      const me = member.guild.members.me;
      if (me && me.permissions.has(PermissionFlagsBits.BanMembers)) {
        await member.ban({ reason: `ScamRadar Auto-Ban: ${record.reason}` });
      }
    } catch (e) {}
  }

  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch) return;
    const embed = new EmbedBuilder()
      .setTitle(`${emojis.scam_alert} | MARKED SCAMMER JOINED`)
      .setColor(colors.danger)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: `${emojis.user} User`, value: member.user.tag, inline: true },
        { name: `${emojis.dev_id} Developer ID`, value: `\`${member.id}\``, inline: true },
        { name: `${emojis.reason} Reason`, value: record.reason, inline: false },
        { name: `${emojis.marked_by} Originally Marked By`, value: record.reportedByTag, inline: true },
        { name: `🔨 Action`, value: ab.enabled ? 'Auto-banned' : 'Alert only (auto-ban disabled)', inline: true }
      )
      .setFooter({ text: 'ScamRadar • Auto-Detection', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();
    await ch.send({ embeds: [embed] });
  } catch (e) {}
});

// ─── Slash Handler ────────────────────────────────────────────────────────────

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;
  if (cmd === 'mark') await handleMark(interaction, null, true);
  else if (cmd === 'unmark') await handleUnmark(interaction, null, true);
  else if (cmd === 'profile') await handleProfile(interaction, null, true);
  else if (cmd === 'sl') await handleScammerList(interaction, null, true);
  else if (cmd === 'setchannel') await handleSetChannel(interaction, null, true);
  else if (cmd === 'removechannel') await handleRemoveChannel(interaction, null, true);
  else if (cmd === 'setscanner') await handleSetScanner(interaction, null, true);
  else if (cmd === 'stats') await handleStats(interaction, true);
  else if (cmd === 'recent') await handleRecent(interaction, true);
  else if (cmd === 'search') await handleSearch(interaction, null, true);
  else if (cmd === 'verify') await handleVerify(interaction, null, true);
  else if (cmd === 'unverify') await handleUnverify(interaction, null, true);
  else if (cmd === 'evidence') await handleEvidence(interaction, null, true);
  else if (cmd === 'ping') await handlePing(interaction, true);
  else if (cmd === 'premium') await handlePremium(interaction, null, true);
  else if (cmd === 'help') await handleHelp(interaction, true);
});

client.login(process.env.TOKEN);
