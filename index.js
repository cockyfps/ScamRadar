const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { colors, emojis } = require('./config');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const PREFIX = process.env.PREFIX || '!';
const DB_PATH = path.join(__dirname, 'data', 'scammers.json');
const SERVERS_PATH = path.join(__dirname, 'data', 'servers.json');
const NP_PATH = path.join(__dirname, 'data', 'noprefix.json');

if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));

function loadDB() { if (!fs.existsSync(DB_PATH)) return {}; return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function saveDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }
function loadServers() { if (!fs.existsSync(SERVERS_PATH)) return {}; return JSON.parse(fs.readFileSync(SERVERS_PATH, 'utf8')); }
function saveServers(data) { fs.writeFileSync(SERVERS_PATH, JSON.stringify(data, null, 2)); }
function loadNP() { if (!fs.existsSync(NP_PATH)) return {}; return JSON.parse(fs.readFileSync(NP_PATH, 'utf8')); }
function saveNP(data) { fs.writeFileSync(NP_PATH, JSON.stringify(data, null, 2)); }

function isOwner(id) { return id === process.env.OWNER_ID; }
function isAdminOrOwner(id, member) { return isOwner(id) || member?.permissions.has(PermissionFlagsBits.Administrator); }
function isNP(id) { return !!loadNP()[id]; }

async function broadcastAlert(embed, originChannelId) {
  const servers = loadServers();
  for (const [guildId, channelId] of Object.entries(servers)) {
    if (channelId === originChannelId) continue;
    try { const ch = await client.channels.fetch(channelId); if (ch) await ch.send({ embeds: [embed] }); } catch (e) {}
  }
}

function scammerAlertEmbed(user, reason, reportedBy, reportedIn) {
  return new EmbedBuilder()
    .setTitle(`${emojis.scam_alert} SCAMMER ALERT — ScamRadar`)
    .setColor(colors.danger)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
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

function profileEmbed(user, record) {
  const isMarked = !!record;
  return new EmbedBuilder()
    .setTitle(`${emojis.profile} ScamRadar Profile — ${user.tag}`)
    .setColor(isMarked ? colors.profile_marked : colors.profile_clean)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: `${emojis.user} Username`, value: user.tag, inline: true },
      { name: `${emojis.dev_id} Developer ID`, value: `\`${user.id}\``, inline: true },
      { name: `${emojis.action} Status`, value: isMarked ? `${emojis.marked} **MARKED AS SCAMMER**` : `${emojis.clean} **Clean — Not Marked**`, inline: false },
      ...(isMarked ? [
        { name: `${emojis.reason} Reason`, value: record.reason, inline: false },
        { name: `${emojis.marked_on} Marked On`, value: `<t:${Math.floor(new Date(record.markedAt).getTime() / 1000)}:F>`, inline: true },
        { name: `${emojis.marked_by} Marked By`, value: record.reportedByTag, inline: true }
      ] : [])
    )
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
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
  if (slice.length === 0) { embed.setDescription(`${emojis.success} No scammers have been marked yet.`); }
  else {
    embed.setDescription(slice.map(([id, r], i) =>
      `**${(page-1)*perPage+i+1}.** \`${id}\` — **${r.tag}**\n> ${emojis.reason} ${r.reason} | ${emojis.marked_on} <t:${Math.floor(new Date(r.markedAt).getTime()/1000)}:d>`
    ).join('\n\n'));
  }
  return embed;
}

function unmarkEmbed(user, removedBy) {
  return new EmbedBuilder()
    .setTitle(`${emojis.unmark} Scammer Removed — ScamRadar`)
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
    .setTitle(`${emojis.np_title} ScamRadar — No Prefix List`)
    .setColor(colors.info)
    .setFooter({ text: `${entries.length} users • ScamRadar`, iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
  if (entries.length === 0) { embed.setDescription('No users in the no prefix list yet.'); }
  else { embed.setDescription(entries.map(([id, d], i) => `**${i+1}.** **${d.tag}**\n> ${emojis.dev_id} \`${id}\``).join('\n\n')); }
  return embed;
}

async function handleMark(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!isAdminOrOwner(authorId, interaction.member) && !isNP(authorId)) {
    const msg = `${emojis.error} You need Administrator permission to mark scammers.`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  let targetId, reason;
  if (isSlash) { const t = interaction.options.getUser('user'); reason = interaction.options.getString('reason'); targetId = t.id; }
  else { targetId = args[0]?.replace(/[<@!>]/g, ''); reason = args.slice(1).join(' '); }
  if (!targetId || !reason) {
    const msg = `${emojis.error} Usage: \`mark @user <reason>\``;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  let targetUser;
  try { targetUser = await client.users.fetch(targetId); } catch {
    const msg = `${emojis.error} Could not find that user.`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  const db = loadDB();
  db[targetId] = { tag: targetUser.tag, reason, markedAt: new Date().toISOString(), reportedById: isSlash ? interaction.user.id : interaction.author.id, reportedByTag: isSlash ? interaction.user.tag : interaction.author.tag };
  saveDB(db);
  const reporter = isSlash ? interaction.user : interaction.author;
  const embed = scammerAlertEmbed(targetUser, reason, reporter, interaction.guild?.name || 'Unknown Server');
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
  await broadcastAlert(embed, interaction.channel?.id);
}

async function handleUnmark(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!isAdminOrOwner(authorId, interaction.member) && !isNP(authorId)) {
    const msg = `${emojis.error} You need Administrator permission to unmark users.`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  let targetId;
  if (isSlash) { targetId = interaction.options.getUser('user').id; } else { targetId = args[0]?.replace(/[<@!>]/g, ''); }
  if (!targetId) { const msg = `${emojis.error} Please provide a user to unmark.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const db = loadDB();
  if (!db[targetId]) { const msg = `${emojis.warning} That user is not in the scammer list.`; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const targetUser = await client.users.fetch(targetId).catch(() => null);
  delete db[targetId]; saveDB(db);
  const remover = isSlash ? interaction.user : interaction.author;
  if (targetUser) {
    const embed = unmarkEmbed(targetUser, remover);
    if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
    await broadcastAlert(embed, interaction.channel?.id);
  } else {
    const msg = `${emojis.success} User \`${targetId}\` removed from the scammer list.`;
    if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
  }
}

async function handleProfile(interaction, args, isSlash) {
  let targetId;
  if (isSlash) { const u = interaction.options.getUser('user', false); const id = interaction.options.getString('id', false); targetId = u?.id || id; }
  else { targetId = args[0]?.replace(/[<@!>]/g, ''); }
  if (!targetId) { const msg = `${emojis.error} Usage: \`profile @user\` or \`profile <ID>\``; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  if (isSlash) await interaction.deferReply();
  let targetUser;
  try { targetUser = await client.users.fetch(targetId); } catch { const msg = `${emojis.error} Could not find that user.`; return isSlash ? interaction.editReply(msg) : interaction.reply(msg); }
  const embed = profileEmbed(targetUser, loadDB()[targetId] || null);
  if (isSlash) await interaction.editReply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleScammerList(interaction, args, isSlash) {
  const page = isSlash ? (interaction.options.getInteger('page') || 1) : (parseInt(args[0]) || 1);
  const embed = scammerListEmbed(loadDB(), page);
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

async function handleSetChannel(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!isAdminOrOwner(authorId, interaction.member) && !isNP(authorId)) {
    const msg = `${emojis.error} You need Administrator permission to set the alert channel.`;
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  const channelId = isSlash ? interaction.options.getChannel('channel').id : interaction.mentions.channels.first()?.id;
  if (!channelId) { const msg = `${emojis.error} Usage: \`setchannel #channel\``; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const servers = loadServers(); servers[interaction.guild.id] = channelId; saveServers(servers);
  const msg = `${emojis.success} Alert channel set to <#${channelId}>! This server will now receive scam alerts.`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handleNP(message, args) {
  if (!isOwner(message.author.id)) return message.reply(`${emojis.error} Only the bot owner can manage the no prefix list.`);
  const sub = args[0]?.toLowerCase();
  if (sub === 'add') {
    const targetId = args[1]?.replace(/[<@!>]/g, '');
    if (!targetId) return message.reply(`${emojis.error} Usage: \`np add @user\` or \`np add <ID>\``);
    let targetUser;
    try { targetUser = await client.users.fetch(targetId); } catch { return message.reply(`${emojis.error} Could not find that user.`); }
    const np = loadNP();
    if (np[targetId]) return message.reply(`${emojis.warning} **${targetUser.tag}** is already in the no prefix list.`);
    np[targetId] = { tag: targetUser.tag, addedAt: new Date().toISOString() }; saveNP(np);
    return message.channel.send({ embeds: [
      new EmbedBuilder().setTitle(`${emojis.np_title} No Prefix — User Added`).setColor(colors.success)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
          { name: `${emojis.user} User`, value: targetUser.tag, inline: true },
          { name: `${emojis.dev_id} Developer ID`, value: `\`${targetId}\``, inline: true },
          { name: `${emojis.np_added} Status`, value: 'Can now use commands without prefix', inline: false }
        )
        .setFooter({ text: 'ScamRadar • No Prefix System', iconURL: client.user.displayAvatarURL() }).setTimestamp()
    ]});
  }
  if (sub === 'remove') {
    const targetId = args[1]?.replace(/[<@!>]/g, '');
    if (!targetId) return message.reply(`${emojis.error} Usage: \`np remove @user\` or \`np remove <ID>\``);
    const np = loadNP();
    if (!np[targetId]) return message.reply(`${emojis.warning} That user is not in the no prefix list.`);
    const tag = np[targetId].tag; delete np[targetId]; saveNP(np);
    return message.channel.send({ embeds: [
      new EmbedBuilder().setTitle(`${emojis.np_title} No Prefix — User Removed`).setColor(colors.danger)
        .addFields(
          { name: `${emojis.user} User`, value: tag, inline: true },
          { name: `${emojis.dev_id} Developer ID`, value: `\`${targetId}\``, inline: true },
          { name: `${emojis.np_removed} Status`, value: 'Removed from no prefix list', inline: false }
        )
        .setFooter({ text: 'ScamRadar • No Prefix System', iconURL: client.user.displayAvatarURL() }).setTimestamp()
    ]});
  }
  if (sub === 'list') return message.channel.send({ embeds: [npListEmbed(loadNP())] });
  return message.reply(`${emojis.error} Usage: \`np add @user\` | \`np remove @user\` | \`np list\``);
}
async function handleEval(message, args) {
  if (!isOwner(message.author.id)) return message.reply(`${emojis.error} Only the bot owner can use eval.`);
  const code = args.join(' ');
  if (!code) return message.reply(`${emojis.error} Usage: \`eval <code>\``);
  try {
    let result = eval(code);
    if (result instanceof Promise) result = await result;
    if (typeof result !== 'string') result = require('util').inspect(result, { depth: 2 });
    result = result.replace(new RegExp(process.env.TOKEN, 'g'), '[TOKEN HIDDEN]');
    if (result.length > 1900) result = result.slice(0, 1900) + '\n... (truncated)';
    return message.channel.send({ embeds: [
      new EmbedBuilder().setTitle('⚙️ Eval — Output').setColor(colors.success)
        .addFields(
          { name: '📥 Input', value: `\`\`\`js\n${code.slice(0, 900)}\n\`\`\`` },
          { name: '📤 Output', value: `\`\`\`js\n${result}\n\`\`\`` }
        )
        .setFooter({ text: 'ScamRadar • Eval', iconURL: client.user.displayAvatarURL() }).setTimestamp()
    ]});
  } catch (err) {
    return message.channel.send({ embeds: [
      new EmbedBuilder().setTitle('⚙️ Eval — Error').setColor(colors.danger)
        .addFields(
          { name: '📥 Input', value: `\`\`\`js\n${code.slice(0, 900)}\n\`\`\`` },
          { name: '❌ Error', value: `\`\`\`js\n${err.message}\n\`\`\`` }
        )
        .setFooter({ text: 'ScamRadar • Eval', iconURL: client.user.displayAvatarURL() }).setTimestamp()
    ]});
  }
}

async function handleHelp(interaction, isSlash) {
  const embed = new EmbedBuilder()
    .setTitle(`${emojis.help_title} ScamRadar — Command List`)
    .setColor(colors.info)
    .setDescription('ScamRadar protects your community by sharing scammer reports across all connected servers.')
    .addFields(
      { name: `${emojis.cmd_mark} Mark a Scammer`, value: '`!mark @user <reason>` or `/mark`\n> Admins & no-prefix users.' },
      { name: `${emojis.cmd_unmark} Unmark a User`, value: '`!unmark @user` or `/unmark`\n> Admins & no-prefix users.' },
      { name: `${emojis.cmd_profile} Profile Lookup`, value: '`!profile @user or <ID>` or `/profile`\n> Anyone can use.' },
      { name: `${emojis.cmd_list} Scammer List`, value: '`!sl [page]` or `!scammerlist [page]` or `/sl`\n> Anyone can use.' },
      { name: `${emojis.cmd_channel} Set Alert Channel`, value: '`!setchannel #channel` or `/setchannel`\n> Admins only.' },
      { name: `${emojis.cmd_np} No Prefix System`, value: '`np add @user` | `np remove @user` | `np list`\n> Bot owner only.' }
    )
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
}

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
  new SlashCommandBuilder().setName('help').setDescription('Show all ScamRadar commands')
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`✅ ScamRadar is online as ${client.user.tag}`);
  client.user.setActivity('📡 Scanning for scammers | .help', { type: 3 });
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try { await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands }); console.log('✅ Slash commands registered globally.'); }
  catch (err) { console.error('❌ Failed to register slash commands:', err); }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;
  if (cmd === 'mark') await handleMark(interaction, null, true);
  else if (cmd === 'unmark') await handleUnmark(interaction, null, true);
  else if (cmd === 'profile') await handleProfile(interaction, null, true);
  else if (cmd === 'sl') await handleScammerList(interaction, null, true);
  else if (cmd === 'setchannel') await handleSetChannel(interaction, null, true);
  else if (cmd === 'help') await handleHelp(interaction, true);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
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
  else if (cmd === 'help' || cmd === 'scamradar') await handleHelp(message, false);
  else if (cmd === 'np') await handleNP(message, args);
});

client.login(process.env.TOKEN);
