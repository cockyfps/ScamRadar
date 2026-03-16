// ═══════════════════════════════════════════════════════
//           ScamRadar — Emoji & Color Config
// ═══════════════════════════════════════════════════════
// Edit this file to change every emoji and color in the bot
// For emojis: use Discord custom emojis like <:name:id>
//             or standard unicode emojis like ✅
// For colors: use hex codes like 0xFF0000 (red)
// ═══════════════════════════════════════════════════════

module.exports = {

  // ─── COLORS ────────────────────────────────────────────
  // These control the left color bar on every embed
  colors: {
    danger:   0xFF0000,   // Red   — scammer alert, marked users
    success:  0x00CC66,   // Green — unmark, clean profile
    info:     0x5865F2,   // Blurple — help, no prefix list
    warning:  0xFF6600,   // Orange — scammer list
    profile_clean:  0x00CC66,  // Green — clean profile
    profile_marked: 0xFF4444,  // Red   — marked profile
  },

  // ─── EMOJIS ────────────────────────────────────────────
  // Replace any value below with a custom Discord emoji
  // Example: scam_alert: '<:scamalert:1234567890>'

  emojis: {

    // Scammer Alert
    scam_alert:     '🚨',   // Title of scammer alert embed
    user:           '👤',   // User field
    dev_id:         '🆔',   // Developer ID field
    reason:         '📋',   // Reason field
    reported_by:    '🏴',   // Reported by field
    reported_in:    '🌐',   // Reported in field

    // Profile
    profile:        '🔍',   // Profile command title
    marked:         '🔴',   // Marked status indicator
    clean:          '🟢',   // Clean status indicator
    marked_on:      '📅',   // Marked on date field
    marked_by:      '🏴',   // Marked by field

    // Scammer List
    list:           '📋',   // Scammer list title
    list_entry:     '•',    // Bullet for each entry

    // Unmark
    unmark:         '✅',   // Unmark embed title
    removed_by:     '👮',   // Removed by field
    action:         '🛡️',  // Action field

    // No Prefix
    np_title:       '⚡',   // No prefix embed title
    np_added:       '✅',   // NP user added status
    np_removed:     '❌',   // NP user removed status

    // Help
    help_title:     '🛡️',  // Help embed title
    cmd_mark:       '🔨',   // Mark command
    cmd_unmark:     '✅',   // Unmark command
    cmd_profile:    '🔍',   // Profile command
    cmd_list:       '📋',   // List command
    cmd_channel:    '📡',   // Set channel command
    cmd_np:         '⚡',   // No prefix command

    // General
    error:          '❌',   // Error messages
    warning:        '⚠️',  // Warning messages
    success:        '✅',   // Success messages
    footer:         '🛡️',  // Used in footer text (optional)
  }

};
