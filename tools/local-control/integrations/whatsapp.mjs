export function evaluateWhatsappConfig(env) {
  const provider = (env.WHATSAPP_PROVIDER ?? '').trim();
  const from = (env.WHATSAPP_FROM ?? '').trim();
  const to = (env.WHATSAPP_TO ?? '').trim();
  const sid = (env.TWILIO_ACCOUNT_SID ?? '').trim();
  const token = (env.TWILIO_AUTH_TOKEN ?? '').trim();
  const baseConfigured = !!(provider && from && to);
  const twilioConfigured = !!(sid && token);
  const directConfigured = provider === 'twilio' ? baseConfigured && twilioConfigured : baseConfigured;
  return {
    provider: provider || null,
    configured: directConfigured,
    via: provider === 'n8n' ? 'n8n' : (directConfigured ? provider : null),
    twilioConfigured,
    missing: [
      !provider ? 'WHATSAPP_PROVIDER' : null,
      !from ? 'WHATSAPP_FROM' : null,
      !to ? 'WHATSAPP_TO' : null,
      provider === 'twilio' && !sid ? 'TWILIO_ACCOUNT_SID' : null,
      provider === 'twilio' && !token ? 'TWILIO_AUTH_TOKEN' : null,
    ].filter(Boolean),
  };
}

export function buildQuestionMessage(question) {
  const q = question || {};
  const opts = (q.options ?? []).map((o, i) => `${i + 1}. ${o}`).join('\n');
  return [
    `🤖 Claude needs you (#${q.issue ?? '?'})`,
    q.question ?? '',
    opts ? `\nOptions:\n${opts}` : '',
    q.recommendation ? `\nClaude recommends: ${q.recommendation}` : '',
    q.githubUrl ? `\n${q.githubUrl}` : '',
    `\nReply on GitHub or Notion. Timeout: 25 min.`,
  ].filter(Boolean).join('\n');
}
