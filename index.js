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

// ─── Database Helpers ─────────────────────────────────────────────────────────

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return {};
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function loadServers() {
  if (!fs.existsSync(SERVERS_PATH)) return {};
  return JSON.parse(fs.readFileSync(SERVERS_PATH, 'utf8'));
}

function saveServers(data) {
  fs.writeFileSync(SERVERS_PATH, JSON.stringify(data, null, 2));
}

// ─── Ensure data folder exists ───────────────────────────────────────────────
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// ─── Cross-Server Alert ───────────────────────────────────────────────────────
async function broadcastAlert(embed, excludeGuildId) {
  const servers = loadServers();
  for (const [guildId, channelId] of Object.entries(servers)) {
    if (guildId === excludeGuildId) continue;
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel) await channel.send({ embeds: [embed] });
    } catch (e) {
      // Channel may have been deleted, skip silently
    }
  }
}

// ─── Embeds ───────────────────────────────────────────────────────────────────

function scammerAlertEmbed(user, reason, reportedBy, reportedIn) {
  return new EmbedBuilder()
    .setTitle('🚨 SCAMMER ALERT — ScamRadar')
    .setColor(0xFF0000)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: '👤 User', value: `${user.tag}`, inline: true },
      { name: '🆔 Developer ID', value: `\`${user.id}\``, inline: true },
      { name: '📋 Reason', value: reason, inline: false },
      { name: '🏴 Reported By', value: `${reportedBy.tag}`, inline: true },
      { name: '🌐 Reported In', value: reportedIn, inline: true }
    )
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
}

function profileEmbed(user, record) {
  const isMarked = !!record;
  return new EmbedBuilder()
    .setTitle(`🔍 ScamRadar Profile — ${user.tag}`)
    .setColor(isMarked ? 0xFF4444 : 0x00CC66)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: '👤 Username', value: user.tag, inline: true },
      { name: '🆔 Developer ID', value: `\`${user.id}\``, inline: true },
      { name: '🛡️ Status', value: isMarked ? '🔴 **MARKED AS SCAMMER**' : '🟢 **Clean — Not Marked**', inline: false },
      ...(isMarked ? [
        { name: '📋 Reason', value: record.reason, inline: false },
        { name: '📅 Marked On', value: `<t:${Math.floor(new Date(record.markedAt).getTime() / 1000)}:F>`, inline: true },
        { name: '🏴 Marked By', value: record.reportedByTag, inline: true }
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
    .setTitle('📋 ScamRadar — Scammer List')
    .setColor(0xFF6600)
    .setFooter({ text: `Page ${page}/${totalPages} • ${entries.length} total scammers • ScamRadar`, iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  if (slice.length === 0) {
    embed.setDescription('✅ No scammers have been marked yet.');
  } else {
    const desc = slice.map(([id, r], i) =>
      `**${(page - 1) * perPage + i + 1}.** \`${id}\` — **${r.tag}**\n> 📋 ${r.reason} | 📅 <t:${Math.floor(new Date(r.markedAt).getTime() / 1000)}:d>`
    ).join('\n\n');
    embed.setDescription(desc);
  }

  return embed;
}

function unmarkEmbed(user, unbannedBy) {
  return new EmbedBuilder()
    .setTitle('✅ Scammer Removed — ScamRadar')
    .setColor(0x00CC66)
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .addFields(
      { name: '👤 User', value: user.tag, inline: true },
      { name: '🆔 Developer ID', value: `\`${user.id}\``, inline: true },
      { name: '🛡️ Action', value: 'Removed from scammer list', inline: false },
      { name: '👮 Removed By', value: unbannedBy.tag, inline: true }
    )
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();
}

// ─── Command Logic ─────────────────────────────────────────────────────────────

async function handleMark(interaction, args, isSlash) {
  const isOwner = (isSlash ? interaction.user.id : interaction.author.id) === process.env.OWNER_ID;
  if (!isOwner) {
    const msg = '❌ Only the bot owner can mark scammers.';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }

  let targetId, reason;

  if (isSlash) {
    const target = interaction.options.getUser('user');
    reason = interaction.options.getString('reason');
    targetId = target.id;
  } else {
    targetId = args[0]?.replace(/[<@!>]/g, '');
    reason = args.slice(1).join(' ');
  }

  if (!targetId || !reason) {
    const msg = '❌ Usage: `!mark @user <reason>` or `/mark user: reason:`';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }

  let targetUser;
  try {
    targetUser = await client.users.fetch(targetId);
  } catch {
    const msg = '❌ Could not find that user. Make sure the ID is correct.';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }

  const db = loadDB();
  db[targetId] = {
    tag: targetUser.tag,
    reason,
    markedAt: new Date().toISOString(),
    reportedById: isSlash ? interaction.user.id : interaction.author.id,
    reportedByTag: isSlash ? interaction.user.tag : interaction.author.tag
  };
  saveDB(db);

  const reporter = isSlash ? interaction.user : interaction.author;
  const guildName = interaction.guild?.name || 'Unknown Server';
  const embed = scammerAlertEmbed(targetUser, reason, reporter, guildName);

  if (isSlash) await interaction.reply({ embeds: [embed] });
  else await interaction.channel.send({ embeds: [embed] });

  await broadcastAlert(embed, interaction.guild?.id);
}

async function handleUnmark(interaction, args, isSlash) {
  const isOwner = (isSlash ? interaction.user.id : interaction.author.id) === process.env.OWNER_ID;
  if (!isOwner) {
    const msg = '❌ Only the bot owner can unmark users.';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }

  let targetId;
  if (isSlash) {
    targetId = interaction.options.getUser('user').id;
  } else {
    targetId = args[0]?.replace(/[<@!>]/g, '');
  }

  if (!targetId) {
    const msg = '❌ Please provide a user to unmark.';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }

  const db = loadDB();
  if (!db[targetId]) {
    const msg = '⚠️ That user is not in the scammer list.';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }

  const targetUser = await client.users.fetch(targetId).catch(() => null);
  delete db[targetId];
  saveDB(db);

  const remover = isSlash ? interaction.user : interaction.author;
  if (targetUser) {
    const embed = unmarkEmbed(targetUser, remover);
    if (isSlash) await interaction.reply({ embeds: [embed] });
    else await interaction.channel.send({ embeds: [embed] });
    await broadcastAlert(embed, interaction.guild?.id);
  } else {
    const msg = `✅ User \`${targetId}\` has been removed from the scammer list.`;
    if (isSlash) await interaction.reply({ content: msg });
    else await interaction.reply(msg);
  }
}

async function handleProfile(interaction, args, isSlash) {
  let targetId;

  if (isSlash) {
    const userOpt = interaction.options.getUser('user', false);
    const idOpt = interaction.options.getString('id', false);
    targetId = userOpt?.id || idOpt;
  } else {
    targetId = args[0]?.replace(/[<@!>]/g, '');
  }

  if (!targetId) {
    const msg = '❌ Usage: `!profile @user` or `!profile <developerID>`';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }

  if (isSlash) await interaction.deferReply();

  let targetUser;
  try {
    targetUser = await client.users.fetch(targetId);
  } catch {
    const msg = '❌ Could not find a user with that ID.';
    return isSlash ? interaction.editReply(msg) : interaction.reply(msg);
  }

  const db = loadDB();
  const record = db[targetId] || null;
  const embed = profileEmbed(targetUser, record);

  if (isSlash) await interaction.editReply({ embeds: [embed] });
  else await interaction.channel.send({ embeds: [embed] });
}

async function handleScammerList(interaction, args, isSlash) {
  const page = isSlash
    ? (interaction.options.getInteger('page') || 1)
    : (parseInt(args[0]) || 1);
  const db = loadDB();
  const embed = scammerListEmbed(db, page);
  if (isSlash) await interaction.reply({ embeds: [embed] });
  else await interaction.channel.send({ embeds: [embed] });
}

async function handleSetChannel(interaction, args, isSlash) {
  const isOwnerOrAdmin = (isSlash ? interaction.user.id : interaction.author.id) === process.env.OWNER_ID
    || interaction.member?.permissions.has(PermissionFlagsBits.Administrator);

  if (!isOwnerOrAdmin) {
    const msg = '❌ You need Administrator permission to set the alert channel.';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }

  const channelId = isSlash
    ? interaction.options.getChannel('channel').id
    : interaction.mentions.channels.first()?.id;

  if (!channelId) {
    const msg = '❌ Please mention a channel. Usage: `!setchannel #channel`';
    return isSlash ? interaction.reply({ content: msg, ephemeral: true }) : interaction.reply(msg);
  }

  const servers = loadServers();
  servers[interaction.guild.id] = channelId;
  saveServers(servers);

  const msg = `✅ ScamRadar alert channel set to <#${channelId}>! This server will now receive cross-server scam alerts.`;
  if (isSlash) await interaction.reply({ content: msg });
  else await interaction.reply(msg);
}

async function handleHelp(interaction, isSlash) {
  const embed = new EmbedBuilder()
    .setTitle('🛡️ ScamRadar — Command List')
    .setColor(0x5865F2)
    .setDescription('ScamRadar protects your community by sharing scammer reports across all connected servers.')
    .addFields(
      {
        name: '🔨 Mark a Scammer',
        value: '`!mark @user <reason>` or `/mark`\n> Bot owner only. Marks a user and alerts all servers.'
      },
      {
        name: '✅ Unmark a User',
        value: '`!unmark @user` or `/unmark`\n> Bot owner only. Removes a user from the scammer list.'
      },
      {
        name: '🔍 Profile Lookup',
        value: '`!profile @user` or `!profile <ID>` or `/profile`\n> View someone\'s scammer status, reason, and info.'
      },
      {
        name: '📋 Scammer List',
        value: '`!sl [page]` or `!scammerlist [page]` or `/sl`\n> View all marked scammers. Use page number for more.'
      },
      {
        name: '📡 Set Alert Channel',
        value: '`!setchannel #channel` or `/setchannel`\n> Admins only. Set which channel receives cross-server alerts.'
      }
    )
    .setFooter({ text: 'ScamRadar • Cross-Server Scam Protection', iconURL: client.user.displayAvatarURL() })
    .setTimestamp();

  if (isSlash) await interaction.reply({ embeds: [embed] });
  else await interaction.channel.send({ embeds: [embed] });
}

// ─── Slash Command Definitions ────────────────────────────────────────────────

const slashCommands = [
  new SlashCommandBuilder()
    .setName('mark')
    .setDescription('Mark a user as a scammer')
    .addUserOption(o => o.setName('user').setDescription('User to mark').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for marking').setRequired(true)),

  new SlashCommandBuilder()
    .setName('unmark')
    .setDescription('Remove a user from the scammer list')
    .addUserOption(o => o.setName('user').setDescription('User to unmark').setRequired(true)),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Look up a user\'s scammer status')
    .addUserOption(o => o.setName('user').setDescription('Mention a user').setRequired(false))
    .addStringOption(o => o.setName('id').setDescription('Or enter a Discord/Developer ID').setRequired(false)),

  new SlashCommandBuilder()
    .setName('sl')
    .setDescription('View the full scammer list')
    .addIntegerOption(o => o.setName('page').setDescription('Page number').setRequired(false)),

  new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Set the channel to receive cross-server scam alerts')
    .addChannelOption(o => o.setName('channel').setDescription('Alert channel').setRequired(true)),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all ScamRadar commands')
].map(cmd => cmd.toJSON());

// ─── Register Slash Commands ──────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`✅ ScamRadar is online as ${client.user.tag}`);
  client.user.setActivity('📡 Scanning for scammers | !help', { type: 3 });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
    console.log('✅ Slash commands registered globally.');
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
  }
});

// ─── Slash Command Handler ────────────────────────────────────────────────────

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

// ─── Prefix Command Handler ───────────────────────────────────────────────────

client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift().toLowerCase();

  if (cmd === 'mark') await handleMark(message, args, false);
  else if (cmd === 'unmark') await handleUnmark(message, args, false);
  else if (cmd === 'profile') await handleProfile(message, args, false);
  else if (cmd === 'sl' || cmd === 'scammerlist') await handleScammerList(message, args, false);
  else if (cmd === 'setchannel') await handleSetChannel(message, args, false);
  else if (cmd === 'help' || cmd === 'scamradar') await handleHelp(message, false);
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.TOKEN);
