const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const crypto = require('crypto');
const { colors, emojis } = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const PREFIX = process.env.PREFIX || '.';
const PAYPAL = process.env.PAYPAL_ME || 'https://paypal.me/yourlink';
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// ─── Redis Helpers ────────────────────────────────────────────────────────────

async function redisGet(key) {
  try {
    const res = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : {};
  } catch (e) { return {}; }
}

async function redisSet(key, value) {
  try {
    await fetch(`${REDIS_URL}/set/${key}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(value) })
    });
  } catch (e) {}
}

async function loadDB() { return await redisGet('scammers'); }
async function saveDB(data) { await redisSet('scammers', data); }
async function loadServers() { return await redisGet('servers'); }
async function saveServers(data) { await redisSet('servers', data); }
async function loadNP() { return await redisGet('noprefix'); }
async function saveNP(data) { await redisSet('noprefix', data); }
async function loadTrusted() { return await redisGet('trusted'); }
async function saveTrusted(data) { await redisSet('trusted', data); }
async function loadEvidence() { return await redisGet('evidence'); }
async function saveEvidence(data) { await redisSet('evidence', data); }
async function loadPremium() { return await redisGet('premium'); }
async function savePremium(data) { await redisSet('premium', data); }
async function loadCodes() { return await redisGet('codes'); }
async function saveCodes(data) { await redisSet('codes', data); }
async function loadScanners() { return await redisGet('scanners'); }
async function saveScanners(data) { await redisSet('scanners', data); }

function isOwner(id) { return id === process.env.OWNER_ID; }
function isAdminOrOwner(id, member) { return isOwner(id) || member?.permissions.has(PermissionFlagsBits.Administrator); }
async function isNP(id) { const np = await loadNP(); return !!np[id]; }
async function isPremium(id) {
  const p = await loadPremium();
  if (!p[id]) return false;
  if (p[id].type === 'lifetime') return true;
  return new Date(p[id].expiresAt) > new Date();
}
async function canModerate(id, member) { return isAdminOrOwner(id, member) || await isNP(id) || await isPremium(id); }

// ─── Broadcast ────────────────────────────────────────────────────────────────

async function broadcastEmbed(embed, originChannelId) {
  const servers = await loadServers();
  for (const [guildId, channelId] of Object.entries(servers)) {
    if (channelId === originChannelId) continue;
    try { const ch = await client.channels.fetch(channelId); if (ch) await ch.send({ embeds: [embed] }); } catch (e) {}
  }
}

async function autoBanInAllServers(userId, reason) {
  let banned = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      const me = guild.members.me;
      if (!me?.permissions.has(PermissionFlagsBits.BanMembers)) continue;
      await guild.bans.create(userId, { reason: `ScamRadar Auto-Ban: ${reason}`, deleteMessageSeconds: 0 });
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

async function profileEmbed(user, record, evidence) {
  const isMarked = !!record;
  const trusted = await loadTrusted();
  const isTrusted = !!trusted[user.id];
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

async function statsEmbed() {
  const scammers = await loadDB();
  const servers = await loadServers();
  const trusted = await loadTrusted();
  const totalUsers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  return new EmbedBuilder()
    .setTitle(`<a:gifstorypersonel:1483044538129059863> ScamRadar Stats`)
    .setColor(colors.info)
    .addFields(
      { name: '<a:pinkwarn:1483042989323587594> Scammers Marked', value: `\`${Object.keys(scammers).length}\``, inline: true },
      { name: '🌐 Connected Servers', value: `\`${Object.keys(servers).length}\``, inline: true },
      { name: '<a:check:1483043904436834395> Trusted Sellers', value: `\`${Object.keys(trusted).length}\``, inline: true },
      { name: '<a:SquidwardDance:677260986960445490> Users Protected', value: `\`${totalUsers.toLocaleString()}\``, inline: true },
      { name: '<:peepoPing:1483375361537478787> Ping', value: `\`${client.ws.ping}ms\``, inline: true },
      { name: '<a:zba4:1433369289485848617> Uptime', value: `\`${Math.floor(client.uptime/3600000)}h ${Math.floor((client.uptime%3600000)/60000)}m\``, inline: true }
    )
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
}

function recentEmbed(scammers) {
  const entries = Object.entries(scammers);
  const recent = entries.sort((a, b) => new Date(b[1].markedAt) - new Date(a[1].markedAt)).slice(0, 5);
  const embed = new EmbedBuilder()
    .setTitle(`<a:pinkwarn:1483042989323587594> Recently Marked`)
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
  if (!await canModerate(authorId, interaction.member)) {
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
  const db = await loadDB();
  if (db[targetId]) {
    const msg = `${emojis.warning} | **${targetUser.tag}** is already marked. Use \`unmark\` first.`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  db[targetId] = { tag: targetUser.tag, reason, markedAt: new Date().toISOString(), reportedById: isSlash ? interaction.user.id : interaction.author.id, reportedByTag: isSlash ? interaction.user.tag : interaction.author.tag, reportedIn: interaction.guild?.name || 'Unknown Server' };
  await saveDB(db);
  const count = Object.keys(db).length;
  const reporter = isSlash ? interaction.user : interaction.author;
  const guildName = interaction.guild?.name || 'Unknown Server';
  const embed = scammerAlertEmbed(targetUser, reason, reporter, guildName, count);
  const confirmMsg = `${emojis.success} | **Marked!** Alert sent to all connected servers.`;
  if (isSlash) {
    await interaction.reply({ content: confirmMsg, ephemeral: true });
    await interaction.channel.send({ embeds: [embed] });
  } else {
    await interaction.reply(confirmMsg);
    await interaction.channel.send({ embeds: [embed] });
  }
  await broadcastEmbed(embed, interaction.channel?.id);
  const banned = await autoBanInAllServers(targetId, reason);
  if (banned > 0) await interaction.channel.send(`${emojis.error} | **Auto-banned** \`${targetUser.tag}\` from **${banned}** server(s).`);
}

async function handleUnmark(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!await canModerate(authorId, interaction.member)) {
    const msg = `${emojis.error} | **You need Administrator permission to unmark users.**`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  let targetId;
  if (isSlash) { targetId = interaction.options.getUser('user').id; } else { targetId = args[0]?.replace(/[<@!>]/g, ''); }
  if (!targetId) { const msg = `${emojis.error} | Please provide a user to unmark.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const db = await loadDB();
  if (!db[targetId]) { const msg = `${emojis.warning} | That user is not in the scammer list.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const targetUser = await client.users.fetch(targetId).catch(() => null);
  delete db[targetId]; await saveDB(db);
  const ev = await loadEvidence(); delete ev[targetId]; await saveEvidence(ev);
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
  const db = await loadDB();
  const ev = await loadEvidence();
  const embed = await profileEmbed(targetUser, db[targetId] || null, ev[targetId] || []);
  if (isSlash) await interaction.editReply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleScammerList(interaction, args, isSlash) {
  const page = isSlash ? (interaction.options.getInteger('page') || 1) : (parseInt(args[0]) || 1);
  const embed = scammerListEmbed(await loadDB(), page);
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleSetChannel(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!await canModerate(authorId, interaction.member)) {
    const msg = `${emojis.error} | **You need Administrator permission to set the alert channel.**`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  const channelId = isSlash ? interaction.options.getChannel('channel').id : interaction.mentions.channels.first()?.id;
  if (!channelId) { const msg = `${emojis.error} | Usage: \`setchannel #channel\``; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const servers = await loadServers(); servers[interaction.guild.id] = channelId; await saveServers(servers);
  const msg = `${emojis.success} | Alert channel set to <#${channelId}>! This server will now receive scam alerts.`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handleRemoveChannel(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!await canModerate(authorId, interaction.member)) {
    const msg = `${emojis.error} | **You need Administrator permission.**`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  const servers = await loadServers();
  if (!servers[interaction.guild.id]) { const msg = `${emojis.warning} | This server has no alert channel set.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  delete servers[interaction.guild.id]; await saveServers(servers);
  const msg = `${emojis.success} | Alert channel removed.`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handleStats(interaction, isSlash) {
  const embed = await statsEmbed();
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleRecent(interaction, isSlash) {
  const embed = recentEmbed(await loadDB());
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleSearch(interaction, args, isSlash) {
  const keyword = isSlash ? interaction.options.getString('keyword') : args.join(' ');
  if (!keyword) { const msg = `${emojis.error} | Usage: \`search <keyword>\``; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const db = await loadDB();
  const results = Object.entries(db).filter(([id, r]) =>
    r.reason.toLowerCase().includes(keyword.toLowerCase()) || r.tag.toLowerCase().includes(keyword.toLowerCase())
  );
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
  if (!await canModerate(authorId, interaction.member)) {
    const msg = `${emojis.error} | **You need Administrator permission to verify users.**`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  let targetId;
  if (isSlash) { targetId = interaction.options.getUser('user').id; } else { targetId = args[0]?.replace(/[<@!>]/g, ''); }
  if (!targetId) { return interaction.reply(`${emojis.error} | Usage: \`verify @user\``); }
  let targetUser;
  try { targetUser = await client.users.fetch(targetId); } catch { return interaction.reply(`${emojis.error} | Could not find that user.`); }
  const db = await loadDB();
  if (db[targetId]) { return interaction.reply(`${emojis.error} | Cannot verify a marked scammer.`); }
  const trusted = await loadTrusted();
  if (trusted[targetId]) { return interaction.reply(`${emojis.warning} | Already verified.`); }
  trusted[targetId] = { tag: targetUser.tag, verifiedAt: new Date().toISOString(), verifiedByTag: isSlash ? interaction.user.tag : interaction.author.tag };
  await saveTrusted(trusted);
  const embed = new EmbedBuilder()
    .setTitle(`${emojis.clean} Verified Trusted Seller`).setColor(colors.success)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields({ name: `${emojis.user} User`, value: targetUser.tag, inline: true }, { name: `${emojis.dev_id} ID`, value: `\`${targetId}\``, inline: true }, { name: `${emojis.marked_by} Verified By`, value: isSlash ? interaction.user.tag : interaction.author.tag, inline: true })
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() }).setTimestamp();
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleUnverify(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!await canModerate(authorId, interaction.member)) { return interaction.reply(`${emojis.error} | **You need Administrator permission.**`); }
  let targetId;
  if (isSlash) { targetId = interaction.options.getUser('user').id; } else { targetId = args[0]?.replace(/[<@!>]/g, ''); }
  if (!targetId) { return interaction.reply(`${emojis.error} | Usage: \`unverify @user\``); }
  const trusted = await loadTrusted();
  if (!trusted[targetId]) { return interaction.reply(`${emojis.warning} | That user is not verified.`); }
  const tag = trusted[targetId].tag; delete trusted[targetId]; await saveTrusted(trusted);
  const msg = `${emojis.success} | **${tag}** has been unverified.`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handleEvidence(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!await canModerate(authorId, interaction.member)) { return interaction.reply(`${emojis.error} | **You need Administrator permission.**`); }
  let targetId, url;
  if (isSlash) { targetId = interaction.options.getUser('user').id; url = interaction.options.getString('url'); }
  else { targetId = args[0]?.replace(/[<@!>]/g, ''); url = args[1]; }
  if (!targetId || !url) { return interaction.reply(`${emojis.error} | Usage: \`evidence @user <url>\``); }
  const db = await loadDB();
  if (!db[targetId]) { return interaction.reply(`${emojis.warning} | That user is not in the scammer list.`); }
  const ev = await loadEvidence();
  if (!ev[targetId]) ev[targetId] = [];
  ev[targetId].push({ url, addedAt: new Date().toISOString(), addedByTag: isSlash ? interaction.user.tag : interaction.author.tag });
  await saveEvidence(ev);
  const msg = `${emojis.success} | Evidence added. Total: **${ev[targetId].length}** link(s).`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handlePing(interaction, isSlash) {
  const embed = new EmbedBuilder()
    .setTitle('<:peepoPing:1483375361537478787> | PING').setColor(colors.info)
    .addFields({ name: '📡 Websocket Ping', value: `\`${client.ws.ping}ms\``, inline: true }, { name: '⏱️ Uptime', value: `\`${Math.floor(client.uptime/3600000)}h ${Math.floor((client.uptime%3600000)/60000)}m ${Math.floor((client.uptime%60000)/1000)}s\``, inline: true })
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() }).setTimestamp();
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleSetScanner(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!isAdminOrOwner(authorId, interaction.member)) { return interaction.reply(`${emojis.error} | **You need Administrator permission.**`); }
  const channelId = isSlash ? interaction.options.getChannel('channel').id : interaction.mentions.channels.first()?.id;
  if (!channelId) { return interaction.reply(`${emojis.error} | Usage: \`setscanner #channel\``); }
  const scanners = await loadScanners(); scanners[interaction.guild.id] = channelId; await saveScanners(scanners);
  const msg = `${emojis.success} | Scanner channel set to <#${channelId}>! Bot will scan messages for Discord IDs and auto-add to database.`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handlePremium(interaction, args, isSlash) {
  const sub = isSlash ? interaction.options.getString('action') : args[0]?.toLowerCase();
  const authorId = isSlash ? interaction.user.id : interaction.author.id;

  if (!sub || sub === 'view') {
    const embed = new EmbedBuilder()
      .setTitle('💎 ScamRadar Premium').setColor(0xFFD700)
      .setDescription('Unlock no-prefix commands and premium features!')
      .addFields(
        { name: '📅 Monthly Plan — $4.99', value: '• No prefix commands for 30 days\n• Premium badge in profile', inline: false },
        { name: '♾️ Lifetime Plan — $9.99', value: '• No prefix commands forever\n• Lifetime premium badge', inline: false },
        { name: '💳 How to buy', value: `Run \`.premium buy monthly\` or \`.premium buy lifetime\``, inline: false }
      )
      .setFooter({ text: 'ScamRadar • Premium System', iconURL: client.user.displayAvatarURL() }).setTimestamp();
    return isSlash ? interaction.reply({ embeds: [embed] }) : interaction.channel.send({ embeds: [embed] });
  }

  if (sub === 'buy') {
    const plan = isSlash ? interaction.options.getString('plan') : args[1]?.toLowerCase();
    if (!plan || !['monthly', 'lifetime'].includes(plan)) { return interaction.reply(`${emojis.error} | Usage: \`premium buy monthly\` or \`premium buy lifetime\``); }
    const price = plan === 'monthly' ? '$4.99' : '$9.99';
    const embed = new EmbedBuilder()
      .setTitle('💳 Complete Your Purchase').setColor(0xFFD700)
      .addFields(
        { name: '📦 Plan', value: plan === 'monthly' ? 'Monthly — $4.99' : 'Lifetime — $9.99', inline: true },
        { name: '💵 Amount', value: price, inline: true },
        { name: '🔗 Payment Link', value: `[Click here to pay](${PAYPAL})`, inline: false },
        { name: '📝 After Payment', value: `Send payment screenshot to bot owner. They'll give you an activation code.\nThen run: \`.premium activate <code>\``, inline: false }
      )
      .setFooter({ text: 'ScamRadar • Premium System', iconURL: client.user.displayAvatarURL() }).setTimestamp();
    return isSlash ? interaction.reply({ embeds: [embed] }) : interaction.channel.send({ embeds: [embed] });
  }

  if (sub === 'activate') {
    const code = isSlash ? interaction.options.getString('code') : args[1];
    if (!code) { return interaction.reply(`${emojis.error} | Usage: \`premium activate <code>\``); }
    const codes = await loadCodes();
    if (!codes[code]) { return interaction.reply(`${emojis.error} | Invalid or already used code.`); }
    const plan = codes[code].plan;
    const premium = await loadPremium();
    if (plan === 'lifetime') {
      premium[authorId] = { type: 'lifetime', activatedAt: new Date().toISOString(), plan };
    } else {
      const expires = new Date(); expires.setDate(expires.getDate() + 30);
      premium[authorId] = { type: 'monthly', activatedAt: new Date().toISOString(), expiresAt: expires.toISOString(), plan };
    }
    await savePremium(premium);
    delete codes[code]; await saveCodes(codes);
    const np = await loadNP();
    try { const u = await client.users.fetch(authorId); np[authorId] = { tag: u.tag, addedAt: new Date().toISOString() }; } catch (e) {}
    await saveNP(np);
    const embed = new EmbedBuilder()
      .setTitle('💎 Premium Activated!').setColor(0xFFD700)
      .addFields(
        { name: '📦 Plan', value: plan === 'lifetime' ? 'Lifetime ♾️' : 'Monthly 📅', inline: true },
        { name: '✅ Status', value: 'Active', inline: true },
        { name: '📅 Expires', value: plan === 'lifetime' ? 'Never' : `<t:${Math.floor(new Date(premium[authorId].expiresAt).getTime()/1000)}:F>`, inline: false }
      )
      .setDescription('You now have no-prefix access to all commands!')
      .setFooter({ text: 'ScamRadar • Premium System', iconURL: client.user.displayAvatarURL() }).setTimestamp();
    return isSlash ? interaction.reply({ embeds: [embed] }) : interaction.channel.send({ embeds: [embed] });
  }

  if (sub === 'status') {
    const premium = await loadPremium();
    if (!premium[authorId]) { return interaction.reply(`${emojis.warning} | No active premium. Run \`.premium view\` to see plans.`); }
    const p = premium[authorId];
    const isActive = p.type === 'lifetime' || new Date(p.expiresAt) > new Date();
    const embed = new EmbedBuilder()
      .setTitle('💎 Your Premium Status').setColor(isActive ? 0xFFD700 : 0xFF4444)
      .addFields(
        { name: '📦 Plan', value: p.type === 'lifetime' ? 'Lifetime ♾️' : 'Monthly 📅', inline: true },
        { name: '✅ Status', value: isActive ? 'Active 🟢' : 'Expired 🔴', inline: true },
        { name: '📅 Activated', value: `<t:${Math.floor(new Date(p.activatedAt).getTime()/1000)}:F>`, inline: false },
        { name: '⏳ Expires', value: p.type === 'lifetime' ? 'Never' : `<t:${Math.floor(new Date(p.expiresAt).getTime()/1000)}:F>`, inline: false }
      )
      .setFooter({ text: 'ScamRadar • Premium System', iconURL: client.user.displayAvatarURL() }).setTimestamp();
    return isSlash ? interaction.reply({ embeds: [embed] }) : interaction.channel.send({ embeds: [embed] });
  }

  return interaction.reply(`${emojis.error} | Usage: \`premium view\` | \`premium buy\` | \`premium activate\` | \`premium status\``);
}

async function handleGenCode(message, args) {
  if (!isOwner(message.author.id)) return message.reply(`${emojis.error} | Owner only.`);
  const plan = args[0]?.toLowerCase();
  if (!plan || !['monthly', 'lifetime'].includes(plan)) return message.reply(`${emojis.error} | Usage: \`gencode <monthly/lifetime>\``);
  const code = 'SR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const codes = await loadCodes();
  codes[code] = { plan, createdAt: new Date().toISOString() };
  await saveCodes(codes);
  return message.reply(`${emojis.success} | Code for **${plan}**:\n\`\`\`${code}\`\`\``);
}

async function handleNP(message, args) {
  if (!isOwner(message.author.id)) return message.reply(`${emojis.error} | Only the bot owner can manage the no prefix list.`);
  const sub = args[0]?.toLowerCase();
  if (sub === 'add') {
    const targetId = args[1]?.replace(/[<@!>]/g, '');
    if (!targetId) return message.reply(`${emojis.error} | Usage: \`np add @user\` or \`np add <ID>\``);
    let targetUser;
    try { targetUser = await client.users.fetch(targetId); } catch { return message.reply(`${emojis.error} | Could not find that user.`); }
    const np = await loadNP();
    if (np[targetId]) return message.reply(`${emojis.warning} **${targetUser.tag}** | is already in the no prefix list.`);
    np[targetId] = { tag: targetUser.tag, addedAt: new Date().toISOString() }; await saveNP(np);
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
    const np = await loadNP();
    if (!np[targetId]) return message.reply(`${emojis.warning} | That user is not in the no prefix list.`);
    const tag = np[targetId].tag; delete np[targetId]; await saveNP(np);
    return message.channel.send({ embeds: [
      new EmbedBuilder().setTitle(`${emojis.np_title} No Prefix • User Removed`).setColor(colors.danger)
        .addFields({ name: `${emojis.user} User`, value: tag, inline: true }, { name: `${emojis.dev_id} Developer ID`, value: `\`${targetId}\``, inline: true }, { name: `${emojis.np_removed} Status`, value: 'Removed from no prefix list', inline: false })
        .setFooter({ text: 'ScamRadar • No Prefix System', iconURL: client.user.displayAvatarURL() }).setTimestamp()
    ]});
  }
  if (sub === 'list') return message.channel.send({ embeds: [npListEmbed(await loadNP())] });
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
    return message.channel.send({ embeds: [new EmbedBuilder().setTitle('Eval • Output').setColor(colors.success).addFields({ name: '📥 Input', value: `\`\`\`js\n${code.slice(0, 900)}\n\`\`\`` }, { name: '📤 Output', value: `\`\`\`js\n${result}\n\`\`\`` }).setFooter({ text: 'ScamRadar • Eval', iconURL: client.user.displayAvatarURL() }).setTimestamp()] });
  } catch (err) {
    return message.channel.send({ embeds: [new EmbedBuilder().setTitle('⚙️ Eval • Error').setColor(colors.danger).addFields({ name: '📥 Input', value: `\`\`\`js\n${code.slice(0, 900)}\n\`\`\`` }, { name: '❌ Error', value: `\`\`\`js\n${err.message}\n\`\`\`` }).setFooter({ text: 'ScamRadar • Eval', iconURL: client.user.displayAvatarURL() }).setTimestamp()] });
  }
}

async function handleSh(message, args) {
  if (!isOwner(message.author.id)) return message.reply(`${emojis.error} | **Only the bot owner can use sh.**`);
  const cmd = args.join(' ');
  if (!cmd) return message.reply(`${emojis.error} | Usage: \`sh <command>\``);
  const { exec } = require('child_process');
  exec(cmd, { timeout: 10000 }, async (err, stdout, stderr) => {
    const output = (stdout || stderr || 'No output.').slice(0, 1900);
    return message.channel.send({ embeds: [new EmbedBuilder().setTitle('🖥️ Shell • Output').setColor(colors.info).addFields({ name: '📥 Command', value: `\`\`\`sh\n${cmd}\n\`\`\`` }, { name: err ? '❌ Error' : '📤 Output', value: `\`\`\`sh\n${output}\n\`\`\`` }).setFooter({ text: 'ScamRadar • Shell', iconURL: client.user.displayAvatarURL() }).setTimestamp()] });
  });
}

async function handleHelp(interaction, isSlash) {
  const embed = new EmbedBuilder()
    .setTitle(`${emojis.help_title} **Command List**`).setColor(colors.info)
    .setDescription(' • Made with ❤️ by Forkie')
    .addFields(
      { name: `${emojis.cmd_mark} Mark a Scammer`, value: '`mark @user <reason>` or `/mark`\n> Owner & Admins only.' },
      { name: `${emojis.cmd_unmark} Unmark a User`, value: '`unmark @user` or `/unmark`\n> Owner & Admins only.' },
      { name: `${emojis.cmd_profile} Profile Lookup`, value: '`profile @user or <ID>` or `/profile`\n> Anyone can use.' },
      { name: `${emojis.cmd_list} Scammer List`, value: '`sl [page]` or `/sl`\n> Anyone can use.' },
      { name: `${emojis.cmd_channel} Set Alert Channel`, value: '`setchannel #channel` or `/setchannel`\n> Admins only.' },
      { name: `${emojis.cmd_channel} Remove Alert Channel`, value: '`removechannel`\n> Admins only.' },
      { name: `📊 Stats`, value: '`stats`\n> Anyone can use.' },
      { name: `🕐 Recent`, value: '`recent`\n> Shows last 5 marked scammers.' },
      { name: `🔎 Search`, value: '`search <keyword>`\n> Search by name or reason.' },
      { name: `${emojis.clean} Verify Seller`, value: '`verify @user`\n> Mark as trusted seller.' },
      { name: `${emojis.marked} Unverify Seller`, value: '`unverify @user`\n> Remove trusted status.' },
      { name: `📎 Add Evidence`, value: '`evidence @user <url>`\n> Attach proof to a scammer.' },
      { name: `🏓 Ping`, value: '`ping`\n> Check bot ping and uptime.' },
      { name: `📡 Set Scanner`, value: '`setscanner #channel`\n> Auto-scan channel for IDs.' },
      { name: `💎 Premium`, value: '`premium view/buy/activate/status`\n> Unlock no-prefix & more.' },
      { name: `${emojis.cmd_np} No Prefix System`, value: '`np add/remove/list`\n> Bot Developer only.' }
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
  new SlashCommandBuilder().setName('setscanner').setDescription('Set channel to scan for blacklisted IDs')
    .addChannelOption(o => o.setName('channel').setDescription('Scanner channel').setRequired(true)),
  new SlashCommandBuilder().setName('premium').setDescription('ScamRadar premium system')
    .addStringOption(o => o.setName('action').setDescription('Action').setRequired(false)
      .addChoices({ name: 'view', value: 'view' }, { name: 'buy', value: 'buy' }, { name: 'activate', value: 'activate' }, { name: 'status', value: 'status' }))
    .addStringOption(o => o.setName('plan').setDescription('Plan').setRequired(false))
    .addStringOption(o => o.setName('code').setDescription('Activation code').setRequired(false)),
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

// ─── Auto-detect + auto-ban on join ──────────────────────────────────────────

client.on('guildMemberAdd', async member => {
  const db = await loadDB();
  if (!db[member.id]) return;
  const record = db[member.id];
  try {
    const me = member.guild.members.me;
    if (me?.permissions.has(PermissionFlagsBits.BanMembers)) {
      await member.ban({ reason: `ScamRadar Auto-Ban: ${record.reason}` });
    }
  } catch (e) {}
  const servers = await loadServers();
  const channelId = servers[member.guild.id];
  if (!channelId) return;
  try {
    const ch = await client.channels.fetch(channelId);
    if (!ch) return;
    const embed = new EmbedBuilder()
      .setTitle(`${emojis.scam_alert} | MARKED SCAMMER JOINED & BANNED`).setColor(colors.danger)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: `${emojis.user} User`, value: member.user.tag, inline: true },
        { name: `${emojis.dev_id} Developer ID`, value: `\`${member.id}\``, inline: true },
        { name: `${emojis.reason} Reason`, value: record.reason, inline: false },
        { name: `${emojis.marked_by} Originally Marked By`, value: record.reportedByTag, inline: true },
        { name: '🔨 Action', value: 'Auto-banned', inline: true }
      )
      .setFooter({ text: 'ScamRadar • Auto-Detection', iconURL: client.user.displayAvatarURL() }).setTimestamp();
    await ch.send({ embeds: [embed] });
  } catch (e) {}
});

// ─── Message Handler ──────────────────────────────────────────────────────────

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Scanner
  const scanners = await loadScanners();
  if (scanners[message.guild?.id] === message.channel.id) {
    const idRegex = /\b(\d{17,19})\b/g;
    const matches = [...message.content.matchAll(idRegex)].map(m => m[1]);
    if (matches.length > 0) {
      const db = await loadDB();
      let added = 0;
      for (const id of matches) {
        if (db[id]) continue;
        let user;
        try { user = await client.users.fetch(id); } catch { continue; }
        db[id] = { tag: user.tag, reason: 'Auto-scanned from blacklist channel', markedAt: new Date().toISOString(), reportedById: 'SCANNER', reportedByTag: 'ScamRadar Scanner', reportedIn: message.guild.name };
        added++;
        await autoBanInAllServers(id, 'Auto-scanned from blacklist channel');
      }
      if (added > 0) {
        await saveDB(db);
        const servers = await loadServers();
        const alertChannelId = servers[message.guild.id];
        if (alertChannelId) {
          try {
            const ch = await client.channels.fetch(alertChannelId);
            const embed = new EmbedBuilder()
              .setTitle(`${emojis.scam_alert} | Scanner Alert`).setColor(colors.danger)
              .setDescription(`Scanned **${added}** new ID(s) and added to the scammer database. Auto-ban executed.`)
              .setFooter({ text: 'ScamRadar • Scanner System', iconURL: client.user.displayAvatarURL() }).setTimestamp();
            await ch.send({ embeds: [embed] });
            await broadcastEmbed(embed, alertChannelId);
          } catch (e) {}
        }
      }
    }
  }

  // Commands
  const content = message.content.trim();
  const authorId = message.author.id;
  const hasPrefix = content.startsWith(PREFIX);
  const npUser = await isNP(authorId);
  const premUser = await isPremium(authorId);
  if (!hasPrefix && !npUser && !isOwner(authorId) && !premUser) return;
  const raw = hasPrefix ? content.slice(PREFIX.length).trim() : content.trim();
  const args = raw.split(/\s+/);
  const cmd = args.shift().toLowerCase();
  if (cmd === 'mark') await handleMark(message, args, false);
  else if (cmd === 'unmark') await handleUnmark(message, args, false);
  else if (cmd === 'profile') await handleProfile(message, args, false);
  else if (cmd === 'sl' || cmd === 'scammerlist') await handleScammerList(message, args, false);
  else if (cmd === 'setchannel') await handleSetChannel(message, args, false);
  else if (cmd === 'removechannel') await handleRemoveChannel(message, args, false);
  else if (cmd === 'stats') await handleStats(message, false);
  else if (cmd === 'recent') await handleRecent(message, false);
  else if (cmd === 'search') await handleSearch(message, args, false);
  else if (cmd === 'verify') await handleVerify(message, args, false);
  else if (cmd === 'unverify') await handleUnverify(message, args, false);
  else if (cmd === 'evidence') await handleEvidence(message, args, false);
  else if (cmd === 'ping') await handlePing(message, false);
  else if (cmd === 'setscanner') await handleSetScanner(message, args, false);
  else if (cmd === 'premium') await handlePremium(message, args, false);
  else if (cmd === 'gencode') await handleGenCode(message, args);
  else if (cmd === 'help' || cmd === 'scamradar') await handleHelp(message, false);
  else if (cmd === 'np') await handleNP(message, args);
  else if (cmd === 'eval') await handleEval(message, args);
  else if (cmd === 'sh') await handleSh(message, args);
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
  else if (cmd === 'stats') await handleStats(interaction, true);
  else if (cmd === 'recent') await handleRecent(interaction, true);
  else if (cmd === 'search') await handleSearch(interaction, null, true);
  else if (cmd === 'verify') await handleVerify(interaction, null, true);
  else if (cmd === 'unverify') await handleUnverify(interaction, null, true);
  else if (cmd === 'evidence') await handleEvidence(interaction, null, true);
  else if (cmd === 'ping') await handlePing(interaction, true);
  else if (cmd === 'setscanner') await handleSetScanner(interaction, null, true);
  else if (cmd === 'premium') await handlePremium(interaction, null, true);
  else if (cmd === 'help') await handleHelp(interaction, true);
});

client.login(process.env.TOKEN);
