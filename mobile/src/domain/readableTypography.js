// Shared by all app text and inputs. Leave font scaling enabled in Typography.
export const MIN_APP_TEXT_SIZE = 14;

export function readableTextMetrics(style = {}, mutedColor, supportingColor) {
  const result = { ...style };
  if (typeof result.fontSize === 'number' && Number.isFinite(result.fontSize)) {
    result.fontSize = Math.max(MIN_APP_TEXT_SIZE, result.fontSize);
    result.lineHeight = Math.max(Number(result.lineHeight) || 0, Math.ceil(result.fontSize * 1.4));
  }
  if (mutedColor && supportingColor && result.color === mutedColor) result.color = supportingColor;
  return result;
}
