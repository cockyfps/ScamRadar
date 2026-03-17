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
    info:     0xA020F0,   // Blurple — help, no prefix list
    warning:  0xA020F0,   // Orange — scammer list
    profile_clean:  0xA020F0,  // Green — clean profile
    profile_marked: 0xFF4444,  // Red   — marked profile
  },

  // ─── EMOJIS ────────────────────────────────────────────
  // Replace any value below with a custom Discord emoji
  // Example: scam_alert: '<:scamalert:1234567890>'

  emojis: {

    // Scammer Alert
    scam_alert:     '<a:pinkwarn:1483042989323587594>',   // Title of scammer alert embed
    user:           '<a:Ghosty_Boy:1483045235637489715>',   // User field
    dev_id:         '<a:pinkstarr:1483360395619209338>',   // Developer ID field
    reason:         '<a:egp_exc:1483043719082020908>',   // Reason field
    reported_by:    '<a:peachslap:1483359726145372170>',   // Reported by field
    reported_in:    '<:bannerstory_discord_pc:1483360180484702278>',   // Reported in field

    // Profile
    profile:        '<a:SquidwardDance:1483360769474301972>',   // Profile command title
    marked:         '<:RedTick:1483042757676109905>',   // Marked status indicator
    clean:          '<:GreenTick:1483042725715640403>',   // Clean status indicator
    marked_on:      '📅',   // Marked on date field
    marked_by:      '<a:Ghosty_Boy:1483045235637489715>',   // Marked by field

    // Scammer List
    list:           '<a:egp_exc:1483043719082020908>',   // Scammer list title
    list_entry:     '•',    // Bullet for each entry

    // Unmark
    unmark:         '<a:z_verified:1084371802639315004>',   // Unmark embed title
    removed_by:     '<a:Ghosty_Boy:1483045235637489715>',   // Removed by field
    action:         '<:bannerstory_red_clear_shield:1483043386364657698>',  // Action field

    // No Prefix
    np_title:       '<a:gifstorypersonel:1483044538129059863>',   // No prefix embed title
    np_added:       '<:GreenTick:1483042725715640403>',   // NP user added status
    np_removed:     '<:RedTick:1483042757676109905>',   // NP user removed status

    // Help
    help_title:     '<a:gifstory_discord_partner:1483044918615085056>',  // Help embed title
    cmd_mark:       '<:bannerstory_red_clear_shield:1483043386364657698>',   // Mark command
    cmd_unmark:     '<a:z_verified:1483044051686260737>',   // Unmark command
    cmd_profile:    '<a:Dance5_peperainbow:1433369806345736234>',   // Profile command
    cmd_list:       '<a:egp_exc:1483043719082020908>',   // List command
    cmd_channel:    '📡',   // Set channel command
    cmd_np:         '⚡',   // No prefix command

    // General
    error:          '<:RedTick:1483042757676109905>',   // Error messages
    warning:        '<a:pinkwarn:1483042989323587594>',  // Warning messages
    success:        '<:GreenTick:1483042725715640403>',   // Success messages
    footer:         '<:bannerstory_red_clear_shield:1483043386364657698>',  // Used in footer text (optional)
  }

};
