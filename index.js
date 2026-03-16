const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

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

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

function loadDB() { if (!fs.existsSync(DB_PATH)) return {}; return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function saveDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }
function loadServers() { if (!fs.existsSync(SERVERS_PATH)) return {}; return JSON.parse(fs.readFileSync(SERVERS_PATH, 'utf8')); }
function saveServers(data) { fs.writeFileSync(SERVERS_PATH, JSON.stringify(data, null, 2)); }
function loadNP() { if (!fs.existsSync(NP_PATH)) return {}; return JSON.parse(fs.readFileSync(NP_PATH, 'utf8')); }
function saveNP(data) { fs.writeFileSync(NP_PATH, JSON.stringify(data, null, 2)); }

function isOwner(id) { return id === process.env.OWNER_ID; }
function isAdminOrOwner(id, member) { return isOwner(id) || member?.permissions.has(PermissionFlagsBits.Administrator); }
function isNP(id) { const np = loadNP(); return !!np[id]; }

async function broadcastAlert(embed, excludeGuildId) {
  const servers = loadServers();
  for (const [guildId, channelId] of Object.entries(servers)) {
    if (guildId === excludeGuildId) continue;
    try { const channel = await client.channels.fetch(channelId); if (channel) await channel.send({ embeds: [embed] }); } catch (e) {}
  }
}

function scammerAlertEmbed(user, reason, reportedBy, reportedIn) {
  return new EmbedBuilder()
    .setTitle('ðŸš¨ SCAMMER ALERT â€” ScamRadar')
    .setColor(0xFF0000)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: 'ðŸ‘¤ User', value: `${user.tag}`, inline: true },
      { name: 'ðŸ†” Developer ID', value: `\`${user.id}\``, inline: true },
      { name: 'ðŸ“‹ Reason', value: reason, inline: false },
      { name: 'ðŸ´ Reported By', value: `${reportedBy.tag}`, inline: true },
      { name: 'ðŸŒ Reported In', value: reportedIn, inline: true }
    )
    .setFooter({ text: 'ScamRadar â€¢ Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
}

function profileEmbed(user, record) {
  const isMarked = !!record;
  return new EmbedBuilder()
    .setTitle(`ðŸ” ScamRadar Profile â€” ${user.tag}`)
    .setColor(isMarked ? 0xFF4444 : 0x00CC66)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: 'ðŸ‘¤ Username', value: user.tag, inline: true },
      { name: 'ðŸ†” Developer ID', value: `\`${user.id}\``, inline: true },
      { name: 'ðŸ›¡ï¸ Status', value: isMarked ? 'ðŸ”´ **MARKED AS SCAMMER**' : 'ðŸŸ¢ **Clean â€” Not Marked**', inline: false },
      ...(isMarked ? [
        { name: 'ðŸ“‹ Reason', value: record.reason, inline: false },
        { name: 'ðŸ“… Marked On', value: `<t:${Math.floor(new Date(record.markedAt).getTime() / 1000)}:F>`, inline: true },
        { name: 'ðŸ´ Marked By', value: record.reportedByTag, inline: true }
      ] : [])
    )
    .setFooter({ text: 'ScamRadar â€¢ Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
}

function scammerListEmbed(scammers, page = 1) {
  const perPage = 10;
  const entries = Object.entries(scammers);
  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  page = Math.min(page, totalPages);
  const slice = entries.slice((page - 1) * perPage, page * perPage);
  const embed = new EmbedBuilder()
    .setTitle('ðŸ“‹ ScamRadar â€” Scammer List')
    .setColor(0xFF6600)
    .setFooter({ text: `Page ${page}/${totalPages} â€¢ ${entries.length} total scammers â€¢ ScamRadar`, iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
  if (slice.length === 0) { embed.setDescription('âœ… No scammers have been marked yet.'); }
  else {
    embed.setDescription(slice.map(([id, r], i) =>
      `**${(page-1)*perPage+i+1}.** \`${id}\` â€” **${r.tag}**\n> ðŸ“‹ ${r.reason} | ðŸ“… <t:${Math.floor(new Date(r.markedAt).getTime()/1000)}:d>`
    ).join('\n\n'));
  }
  return embed;
}

function unmarkEmbed(user, unbannedBy) {
  return new EmbedBuilder()
    .setTitle('âœ… Scammer Removed â€” ScamRadar')
    .setColor(0x00CC66)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: 'ðŸ‘¤ User', value: user.tag, inline: true },
      { name: 'ðŸ†” Developer ID', value: `\`${user.id}\``, inline: true },
      { name: 'ðŸ›¡ï¸ Action', value: 'Removed from scammer list', inline: false },
      { name: 'ðŸ‘® Removed By', value: unbannedBy.tag, inline: true }
    )
    .setFooter({ text: 'ScamRadar â€¢ Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
}

function npListEmbed(npUsers) {
  const entries = Object.entries(npUsers);
  const embed = new EmbedBuilder()
    .setTitle('âš¡ ScamRadar â€” No Prefix List')
    .setColor(0x5865F2)
    .setFooter({ text: `${entries.length} users â€¢ ScamRadar`, iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
  if (entries.length === 0) { embed.setDescription('No users in the no prefix list yet.'); }
  else { embed.setDescription(entries.map(([id, d], i) => `**${i+1}.** **${d.tag}**\n> ðŸ†” \`${id}\``).join('\n\n')); }
  return embed;
}

async function handleMark(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  const member = interaction.member;
  if (!isAdminOrOwner(authorId, member) && !isNP(authorId)) {
    const msg = 'âŒ You need Administrator permission to mark scammers.';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  let targetId, reason;
  if (isSlash) { const t = interaction.options.getUser('user'); reason = interaction.options.getString('reason'); targetId = t.id; }
  else { targetId = args[0]?.replace(/[<@!>]/g, ''); reason = args.slice(1).join(' '); }
  if (!targetId || !reason) {
    const msg = 'âŒ Usage: `mark @user <reason>`';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  let targetUser;
  try { targetUser = await client.users.fetch(targetId); } catch {
    const msg = 'âŒ Could not find that user.';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  const db = loadDB();
  db[targetId] = { tag: targetUser.tag, reason, markedAt: new Date().toISOString(), reportedById: isSlash ? interaction.user.id : interaction.author.id, reportedByTag: isSlash ? interaction.user.tag : interaction.author.tag };
  saveDB(db);
  const reporter = isSlash ? interaction.user : interaction.author;
  const embed = scammerAlertEmbed(targetUser, reason, reporter, interaction.guild?.name || 'Unknown Server');
  if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
  await broadcastAlert(embed, interaction.guild?.id);
}

async function handleUnmark(interaction, args, isSlash) {
  const authorId = isSlash ? interaction.user.id : interaction.author.id;
  if (!isAdminOrOwner(authorId, interaction.member) && !isNP(authorId)) {
    const msg = 'âŒ You need Administrator permission to unmark users.';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  let targetId;
  if (isSlash) { targetId = interaction.options.getUser('user').id; } else { targetId = args[0]?.replace(/[<@!>]/g, ''); }
  if (!targetId) { const msg = 'âŒ Please provide a user to unmark.'; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const db = loadDB();
  if (!db[targetId]) { const msg = 'âš ï¸ That user is not in the scammer list.'; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const targetUser = await client.users.fetch(targetId).catch(() => null);
  delete db[targetId]; saveDB(db);
  const remover = isSlash ? interaction.user : interaction.author;
  if (targetUser) {
    const embed = unmarkEmbed(targetUser, remover);
    if (isSlash) await interaction.reply({ embeds: [embed] }); else await interaction.channel.send({ embeds: [embed] });
    await broadcastAlert(embed, interaction.guild?.id);
  } else {
    const msg = `âœ… User \`${targetId}\` removed from the scammer list.`;
    if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
  }
}

async function handleProfile(interaction, args, isSlash) {
  let targetId;
  if (isSlash) { const u = interaction.options.getUser('user', false); const id = interaction.options.getString('id', false); targetId = u?.id || id; }
  else { targetId = args[0]?.replace(/[<@!>]/g, ''); }
  if (!targetId) { const msg = 'âŒ Usage: `profile @user` or `profile <ID>`'; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  if (isSlash) await interaction.deferReply();
  let targetUser;
  try { targetUser = await client.users.fetch(targetId); } catch { const msg = 'âŒ Could not find that user.'; return isSlash ? interaction.editReply(msg) : interaction.reply(msg); }
  const db = loadDB();
  const embed = profileEmbed(targetUser, db[targetId] || null);
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
    const msg = 'âŒ You need Administrator permission to set the alert channel.';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }
  const channelId = isSlash ? interaction.options.getChannel('channel').id : interaction.mentions.channels.first()?.id;
  if (!channelId) { const msg = 'âŒ Usage: `setchannel #channel`'; return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg); }
  const servers = loadServers(); servers[interaction.guild.id] = channelId; saveServers(servers);
  const msg = `âœ… Alert channel set to <#${channelId}>! This server will now receive scam alerts.`;
  if (isSlash) await interaction.reply({ content: msg }); else await interaction.reply(msg);
}

async function handleNP(message, args) {
  if (!isOwner(message.author.id)) return message.reply('âŒ Only the bot owner can manage the no prefix list.');
  const sub = args[0]?.toLowerCase();

  if (sub === 'add') {
    const targetId = args[1]?.replace(/[<@!>]/g, '');
    if (!targetId) return message.reply('âŒ Usage: `np add @user` or `np add <ID>`');
    let targetUser;
    try { targetUser = await client.users.fetch(targetId); } catch { return message.reply('âŒ Could not find that user.'); }
    const np = loadNP();
    if (np[targetId]) return message.reply(`âš ï¸ **${targetUser.tag}** is already in the no prefix list.`);
    np[targetId] = { tag: targetUser.tag, addedAt: new Date().toISOString() }; saveNP(np);
    return message.channel.send({ embeds: [
      new EmbedBuilder().setTitle('âš¡ No Prefix â€” User Added').setColor(0x00CC66)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields({ name: 'ðŸ‘¤ User', value: targetUser.tag, inline: true }, { name: 'ðŸ†” Developer ID', value: `\`${targetId}\``, inline: true }, { name: 'âœ… Status', value: 'Can now use commands without prefix', inline: false })
        .setFooter({ text: 'ScamRadar â€¢ No Prefix System', iconURL: client.user.displayAvatarURL() }).setTimestamp()
    ]});
  }

  if (sub === 'remove') {
    const targetId = args[1]?.replace(/[<@!>]/g, '');
    if (!targetId) return message.reply('âŒ Usage: `np remove @user` or `np remove <ID>`');
    const np = loadNP();
    if (!np[targetId]) return message.reply('âš ï¸ That user is not in the no prefix list.');
    const tag = np[targetId].tag; delete np[targetId]; saveNP(np);
    return message.channel.send({ embeds: [
      new EmbedBuilder().setTitle('âš¡ No Prefix â€” User Removed').setColor(0xFF4444)
        .addFields({ name: 'ðŸ‘¤ User', value: tag, inline: true }, { name: 'ðŸ†” Developer ID', value: `\`${targetId}\``, inline: true }, { name: 'âŒ Status', value: 'Removed from no prefix list', inline: false })
        .setFooter({ text: 'ScamRadar â€¢ No Prefix System', iconURL: client.user.displayAvatarURL() }).setTimestamp()
    ]});
  }

  if (sub === 'list') return message.channel.send({ embeds: [npListEmbed(loadNP())] });

  return message.reply('âŒ Usage: `np add @user` | `np remove @user` | `np list`');
}

async function handleHelp(interaction, isSlash) {
  const embed = new EmbedBuilder()
    .setTitle('ðŸ›¡ï¸ ScamRadar â€” Command List')
    .setColor(0x5865F2)
    .setDescription('ScamRadar protects your community by sharing scammer reports across all connected servers.')
    .addFields(
      { name: 'ðŸ”¨ Mark a Scammer', value: '`!mark @user <reason>` or `/mark`\n> Admins & no-prefix users.' },
      { name: 'âœ… Unmark a User', value: '`!unmark @user` or `/unmark`\n> Admins & no-prefix users.' },
      { name: 'ðŸ” Profile Lookup', value: '`!profile @user or <ID>` or `/profile`\n> Anyone can use.' },
      { name: 'ðŸ“‹ Scammer List', value: '`!sl [page]` or `!scammerlist [page]` or `/sl`\n> Anyone can use.' },
      { name: 'ðŸ“¡ Set Alert Channel', value: '`!setchannel #channel` or `/setchannel`\n> Admins only.' },
      { name: 'âš¡ No Prefix System', value: '`np add @user` | `np remove @user` | `np list`\n> Bot owner only. Added users skip the `!` prefix.' }
    )
    .setFooter({ text: 'ScamRadar â€¢ Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
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
  console.log(`âœ… ScamRadar is online as ${client.user.tag}`);
  client.user.setActivity('ðŸ“¡ Scanning for scammers | !help', { type: 3 });
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try { await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands }); console.log('âœ… Slash commands registered globally.'); }
  catch (err) { console.error('âŒ Failed to register slash commands:', err); }
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
