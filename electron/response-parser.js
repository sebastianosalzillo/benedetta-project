const {
  REASONING_TAG_NAMES,
  EMOTION_TO_AVATAR_STYLE,
} = require('./constants');
const {
  normalizeSpeechText,
} = require('./workspace-manager');

function parseReasoningSegments(raw) {
  const segments = [];
  for (const tagName of REASONING_TAG_NAMES) {
    const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'gi');
    let match = regex.exec(raw);
    while (match) {
      segments.push(match[1].trim());
      match = regex.exec(raw);
    }
  }
  return segments.filter(Boolean);
}

function stripTrailingIncompleteControls(raw) {
  let output = String(raw || '');
  output = output.replace(/<\|[^|>]*$/g, '');

  for (const tagName of REASONING_TAG_NAMES) {
    const incompleteTag = new RegExp(`<${tagName}(?:[^>]*)>(?![\\s\\S]*?</${tagName}>)`, 'i');
    const match = output.match(incompleteTag);
    if (match?.index != null) {
      output = output.slice(0, match.index);
    }
  }

  return output;
}

function extractSpeechPreview(raw) {
  let preview = stripTrailingIncompleteControls(String(raw || ''));
  preview = preview.replace(/<\|ACT[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|CANVAS[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|BROWSER[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|WORKSPACE[\s\S]*?\|>/gi, '');
  preview = preview.replace(/<\|DELAY:\s*\d+(?:\.\d+)?\|>/gi, '');

  for (const tagName of REASONING_TAG_NAMES) {
    const regex = new RegExp(`<${tagName}>[\\s\\S]*?</${tagName}>`, 'gi');
    preview = preview.replace(regex, '');
  }

  return normalizeSpeechText(preview);
}

function tryParseJsonAt(text, startPos) {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = startPos; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{' || char === '[') {
      depth++;
    } else if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) {
        // Found complete JSON block
        const jsonStr = text.slice(startPos, i + 1);
        try {
          return { json: JSON.parse(jsonStr), endIndex: i + 1 };
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function parseLooseJsonObject(source) {
  let text = String(source || '').trim();
  if (!text) return null;

  // Try to find if multiple objects are present
  const firstBrace = text.indexOf('{');
  if (firstBrace < 0) return null;

  const result = tryParseJsonAt(text, firstBrace);
  return result ? result.json : null;
}

function sanitizeModelJsonEnvelope(source) {
  let text = String(source || '').trim();
  if (!text) return '';

  text = text.replace(/```(?:json)?/gi, '').trim();

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }

  return text
    .replace(/"type"\s*:\s*"tool"\s*:\s*"([^"]+)"/gi, '"type":"tool","tool":"$1"')
    .replace(/"type"\s*:\s*"action"\s*:\s*"([^"]+)"/gi, '"type":"action","tool":"$1"')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function extractToolsFromJson(json) {
  const tools = [];

  if (json.tool && json.args !== undefined) {
    tools.push({ tool: json.tool, args: json.args });
  } else if (Array.isArray(json.segments)) {
    for (const segment of json.segments) {
      if (segment && typeof segment === 'object' && (segment.type === 'tool' || segment.type === 'action') && segment.tool && segment.args !== undefined) {
        tools.push({ tool: segment.tool, args: segment.args });
      }
    }
  } else if (json.tools && Array.isArray(json.tools)) {
    for (const t of json.tools) {
      if (t.tool && t.args !== undefined) {
        tools.push({ tool: t.tool, args: t.args });
      }
    }
  }

  return tools;
}

function mapJsonToolToSequence(jsonTool) {
  const { tool, args } = jsonTool;
  if (!tool || !args || typeof args !== 'object') return null;

  switch (tool) {
    case 'read_file':
      return { type: 'read_file', directive: { path: String(args.path || ''), startLine: args.startLine, endLine: args.endLine } };
    case 'write_file':
      return { type: 'write_file', directive: { path: String(args.path || ''), content: String(args.content || ''), overwrite: Boolean(args.overwrite) } };
    case 'edit_file':
      return { type: 'edit_file', directive: { path: String(args.path || ''), oldString: String(args.oldString || ''), newString: String(args.newString || ''), replaceAll: Boolean(args.replaceAll), regex: Boolean(args.regex) } };
    case 'apply_patch':
      return { type: 'apply_patch', directive: { path: String(args.path || ''), oldText: String(args.oldText || ''), newText: String(args.newText || ''), replaceAll: Boolean(args.replaceAll) } };
    case 'shell':
      return { type: 'shell', directive: { command: String(args.command || ''), cwd: args.cwd, timeout: args.timeout, background: Boolean(args.background) } };
    case 'glob':
      return { type: 'glob', directive: { pattern: String(args.pattern || ''), path: args.path } };
    case 'grep':
      return { type: 'grep', directive: { pattern: String(args.pattern || ''), path: args.path, include: args.include } };
    case 'multi_file_read':
      return { type: 'multi_file_read', directive: { files: Array.isArray(args.files) ? args.files : [] } };
    case 'git':
      return { type: 'git', directive: { action: String(args.action || 'status'), params: args.params || {}, cwd: args.cwd } };
    case 'web_fetch':
      return { type: 'web_fetch', directive: { url: String(args.url || ''), format: args.format } };
    case 'web_search':
      return { type: 'web_search', directive: { query: String(args.query || ''), numResults: args.numResults } };
    case 'memory_search':
      return { type: 'memory_search', directive: { query: String(args.query || ''), scope: String(args.scope || 'all') } };
    case 'task':
      return { type: 'task', directive: { action: String(args.action || 'list'), params: args.params || {} } };
    case 'delay':
      return { type: 'delay', seconds: Math.min(3, Math.max(0, Number(args.seconds) || 0)) };
    case 'browser':
      return { type: 'browser', directive: { action: String(args.action || ''), url: args.url, ref: args.ref, text: args.text, key: args.key, waitAfterMs: args.waitAfterMs } };
    case 'computer':
      return { type: 'computer', directive: { action: String(args.action || ''), titleContains: args.titleContains, app: args.app, text: args.text, combo: args.combo } };
    case 'canvas':
      return { type: 'canvas', directive: { action: String(args.action || ''), layout: args.layout, content: args.content } };
    case 'workspace':
      return { type: 'workspace', directive: { file: String(args.file || ''), mode: String(args.mode || 'append'), content: String(args.content || '') } };
    default:
      return null;
  }
}

function resolveEmotionFromEmoji(text) {
  const raw = String(text || '');
  if (raw.includes('😊') || raw.includes('😄') || raw.includes('🙂')) return 'happy';
  if (raw.includes('😢') || raw.includes('😭') || raw.includes('😞')) return 'sad';
  if (raw.includes('😠') || raw.includes('😡')) return 'angry';
  if (raw.includes('😮') || raw.includes('😲') || raw.includes('😱')) return 'surprised';
  if (raw.includes('🤔') || raw.includes('🧐')) return 'think';
  if (raw.includes('😨') || raw.includes('😰')) return 'fear';
  if (raw.includes('🤢') || raw.includes('🤮')) return 'disgust';
  if (raw.includes('❤️') || raw.includes('😍')) return 'love';
  if (raw.includes('😴') || raw.includes('💤')) return 'sleep';
  return null;
}

function parseStructuredField(output, key) {
  const regex = new RegExp(`${key}\\s*[:=]\\s*(.*)`, 'i');
  const match = String(output || '').match(regex);
  return match ? match[1].trim() : '';
}

function readLooseActField(source, keys) {
  const text = String(source || '');
  for (const key of keys) {
    const regex = new RegExp(`${key}\\s*[:=]\\s*(?:\\{\\s*name\\s*[:=]\\s*["']?([a-z0-9_.-]+)["']?[^}]*\\}|["']?([a-z0-9_.-]+)["']?)`, 'i');
    const match = text.match(regex);
    if (match) {
      return match[1] || match[2] || '';
    }
  }
  return '';
}

function readLooseActNumber(source, keys) {
  const text = String(source || '');
  for (const key of keys) {
    const regex = new RegExp(`${key}\\s*[:=]\\s*([0-9.]+)`, 'i');
    const match = text.match(regex);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

function parseActPayload(payloadText, fallbackText = '') {
  const text = String(payloadText || '').trim();
  if (!text) return null;

  try {
    const json = JSON.parse(text);
    const emotion = String(json.emotion || json.mood || json.expression || '').trim().toLowerCase();
    const style = EMOTION_TO_AVATAR_STYLE[emotion] || EMOTION_TO_AVATAR_STYLE.neutral;

    return {
      emotion: emotion || 'neutral',
      intensity: Number.isFinite(Number(json.intensity)) ? Number(json.intensity) : 0.72,
      pose: json.pose ? String(json.pose).trim().toLowerCase() : null,
      animation: json.animation ? String(json.animation).trim() : null,
      gesture: json.gesture ? String(json.gesture).trim() : (style.motionType === 'gesture' ? style.motion : null),
      gestureHand: json.gestureHand || json.hand || null,
      motion: json.motion ? String(json.motion).trim() : style.motion,
      motionType: json.motionType ? String(json.motionType).trim().toLowerCase() : style.motionType,
      expression: json.expression ? String(json.expression).trim() : style.expression,
      motionSpecified: !!(json.motion || json.gesture || json.animation || json.pose),
    };
  } catch {
    // Loose parsing fallback
    const emotion = readLooseActField(text, ['emotion', 'mood', 'expression']).toLowerCase();
    const style = EMOTION_TO_AVATAR_STYLE[emotion] || EMOTION_TO_AVATAR_STYLE.neutral;
    const intensity = readLooseActNumber(text, ['intensity']);

    return {
      emotion: emotion || 'neutral',
      intensity: intensity != null ? intensity : 0.72,
      pose: readLooseActField(text, ['pose']).toLowerCase() || null,
      animation: readLooseActField(text, ['animation']) || null,
      gesture: readLooseActField(text, ['gesture']) || (style.motionType === 'gesture' ? style.motion : null),
      gestureHand: readLooseActField(text, ['gestureHand', 'hand']) || null,
      motion: readLooseActField(text, ['motion']) || style.motion,
      motionType: (readLooseActField(text, ['motionType']) || style.motionType || '').toLowerCase(),
      expression: readLooseActField(text, ['expression']) || style.expression,
      motionSpecified: text.includes('motion') || text.includes('gesture') || text.includes('animation') || text.includes('pose'),
    };
  }
}

function parseJsonToolCalls(text) {
  const raw = String(text || '');
  const sanitizedRaw = sanitizeModelJsonEnvelope(raw);

  const extractSegmentsFromJsonEnvelope = (json) => {
    const nextSegments = [];
    const segmentList = Array.isArray(json?.segments)
      ? json.segments
      : Array.isArray(json?.timeline)
        ? json.timeline
        : Array.isArray(json?.steps)
          ? json.steps
          : null;

    const pushSpeech = (value) => {
      const textValue = normalizeSpeechText(value);
      if (textValue) nextSegments.push({ type: 'speech', text: textValue });
    };

    const pushTool = (toolName, argsValue) => {
      if (!toolName || argsValue === undefined) return;
      nextSegments.push({
        type: 'tool',
        tool: {
          tool: String(toolName || '').trim(),
          args: argsValue && typeof argsValue === 'object' ? argsValue : {},
        },
      });
    };

    const pushAvatar = (segment) => {
      if (!segment || typeof segment !== 'object') return;
      nextSegments.push({
        type: 'avatar',
        state: segment,
      });
    };

    if (json && typeof json === 'object' && Array.isArray(segmentList)) {
      for (const segment of segmentList) {
        if (!segment || typeof segment !== 'object') continue;
        if (segment.type === 'speech') {
          pushSpeech(segment.text);
          continue;
        }
        if (segment.type === 'avatar') {
          pushAvatar(segment);
          continue;
        }
        if (segment.type === 'tool' || segment.type === 'action') {
          pushTool(segment.tool, segment.args);
          continue;
        }
      }
      return nextSegments;
    }

    if (json && typeof json === 'object') {
      const preSpeech = json.preActionSpeech ?? json.pre_action_speech;
      const postSpeech = json.postActionSpeech ?? json.post_action_speech;
      const speech = json.speech ?? json.text ?? json.message;
      if (preSpeech !== undefined) pushSpeech(preSpeech);
      if (json.tool && json.args !== undefined) {
        pushTool(json.tool, json.args);
      } else if (Array.isArray(json.tools)) {
        for (const toolItem of json.tools) {
          if (!toolItem || typeof toolItem !== 'object') continue;
          pushTool(toolItem.tool, toolItem.args);
        }
      }
      if (postSpeech !== undefined) {
        pushSpeech(postSpeech);
      } else if (speech !== undefined) {
        pushSpeech(speech);
      }
    }

    return nextSegments;
  };

  const summarizeSegments = (segments) => {
    const tools = [];
    const speechParts = [];
    const isActionSegment = (segment) => segment?.type === 'tool' || segment?.type === 'avatar';
    for (const segment of segments) {
      if (segment?.type === 'speech' && segment.text) {
        speechParts.push(segment.text);
      } else if (segment?.type === 'tool' && segment.tool) {
        tools.push(segment.tool);
      }
    }
    const speech = speechParts.join(' ').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
    const firstToolIndex = segments.findIndex((segment) => isActionSegment(segment));
    const preActionSpeech = segments
      .slice(0, firstToolIndex >= 0 ? firstToolIndex : segments.length)
      .filter((segment) => segment.type === 'speech')
      .map((segment) => segment.text)
      .join(' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    const postActionSpeech = (firstToolIndex >= 0 ? segments.slice(firstToolIndex + 1) : [])
      .filter((segment) => segment.type === 'speech')
      .map((segment) => segment.text)
      .join(' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    return {
      matchedJson: segments.length > 0,
      tools,
      speech,
      segments,
      preActionSpeech,
      postActionSpeech,
    };
  };

  const rootJsonResult = raw.startsWith('{') || raw.startsWith('[')
    ? tryParseJsonAt(raw, 0)
    : null;
  if (rootJsonResult && rootJsonResult.endIndex === raw.length) {
    const rootSegments = extractSegmentsFromJsonEnvelope(rootJsonResult.json);
    if (rootSegments.length > 0) {
      return summarizeSegments(rootSegments);
    }
  }

  if (sanitizedRaw) {
    const sanitizedRootResult = sanitizedRaw.startsWith('{') || sanitizedRaw.startsWith('[')
      ? tryParseJsonAt(sanitizedRaw, 0)
      : null;
    if (sanitizedRootResult && sanitizedRootResult.endIndex === sanitizedRaw.length) {
      const sanitizedSegments = extractSegmentsFromJsonEnvelope(sanitizedRootResult.json);
      if (sanitizedSegments.length > 0) {
        return summarizeSegments(sanitizedSegments);
      }
    }

    const sanitizedLoose = parseLooseJsonObject(sanitizedRaw);
    if (sanitizedLoose && typeof sanitizedLoose === 'object') {
      const looseSegments = extractSegmentsFromJsonEnvelope(sanitizedLoose);
      if (looseSegments.length > 0) {
        return summarizeSegments(looseSegments);
      }
    }
  }

  const tools = [];
  const speechParts = [];
  const segments = [];
  let lastIndex = 0;

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '{') continue;
    const jsonResult = tryParseJsonAt(raw, i);
    if (!jsonResult) continue;
    const { json, endIndex } = jsonResult;

    if (json && typeof json === 'object') {
      const extractedTools = extractToolsFromJson(json);
      if (extractedTools.length > 0) {
        const beforeText = raw.slice(lastIndex, i).trim();
        if (beforeText) {
          speechParts.push(beforeText);
          segments.push({ type: 'speech', text: beforeText });
        }
        tools.push(...extractedTools);
        for (const extractedTool of extractedTools) {
          segments.push({ type: 'tool', tool: extractedTool });
        }
        lastIndex = endIndex;
        i = endIndex - 1;
        continue;
      }
    }
  }

  const afterText = raw.slice(lastIndex).trim();
  if (afterText) {
    speechParts.push(afterText);
    segments.push({ type: 'speech', text: afterText });
  }

  return {
    matchedJson: tools.length > 0,
    tools,
    speech: speechParts.join(' ').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim(),
    segments,
    preActionSpeech: segments
      .slice(0, segments.findIndex((segment) => segment.type === 'tool') >= 0 ? segments.findIndex((segment) => segment.type === 'tool') : segments.length)
      .filter((segment) => segment.type === 'speech')
      .map((segment) => segment.text)
      .join(' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
    postActionSpeech: (() => {
      const firstToolIndex = segments.findIndex((segment) => segment.type === 'tool');
      return (firstToolIndex >= 0 ? segments.slice(firstToolIndex + 1) : [])
        .filter((segment) => segment.type === 'speech')
        .map((segment) => segment.text)
        .join(' ')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
    })(),
  };
}

function buildParsedResponseFromJsonSegments(jsonSegments, raw, fallbackInput, reasoning = '', options = {}) {
  const sequence = [];
  let firstAvatarState = null;

  for (const segment of Array.isArray(jsonSegments) ? jsonSegments : []) {
    if (segment.type === 'speech') {
      const text = normalizeSpeechText(segment.text);
      if (text) sequence.push({ type: 'speech', text });
      continue;
    }

    if (segment.type === 'avatar' && segment.state) {
      const avatarState = parseActPayload(typeof segment.state === 'string' ? segment.state : JSON.stringify(segment.state), fallbackInput);
      if (avatarState) {
        const item = { type: 'avatar', ...avatarState };
        if (!firstAvatarState) firstAvatarState = item;
        sequence.push(item);
      }
      continue;
    }

    if (segment.type !== 'tool' || !segment.tool) continue;
    const item = mapJsonToolToSequence(segment.tool);
    if (!item) continue;
    sequence.push(item);
  }

  const speech = sequence
    .filter((item) => item.type === 'speech' && item.text)
    .map((item) => item.text)
    .join(' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  if (!firstAvatarState) {
    const emojiEmotion = resolveEmotionFromEmoji(raw);
    if (emojiEmotion) {
      const style = EMOTION_TO_AVATAR_STYLE[emojiEmotion] || EMOTION_TO_AVATAR_STYLE.neutral;
      firstAvatarState = {
        type: 'avatar',
        emotion: emojiEmotion,
        intensity: 0.72,
        pose: null,
        animation: null,
        gesture: style.motionType === 'gesture' ? style.motion : null,
        gestureHand: null,
        motion: style.motion,
        motionType: style.motionType,
        expression: style.expression,
        motionSpecified: !!style.motion,
      };
      sequence.unshift(firstAvatarState);
    }
  }

  return {
    format: options.format || 'json',
    raw,
    speech,
    preActionSpeech: normalizeSpeechText(options.preActionSpeech || ''),
    postActionSpeech: normalizeSpeechText(options.postActionSpeech || ''),
    reasoning,
    sequence,
    firstAvatarState,
    firstActState: firstAvatarState,
    fallbackText: fallbackInput,
  };
}

function buildParsedResponseFromSequenceChunk(baseResponse, sequenceChunk = [], fallbackInput = '') {
  const sequence = Array.isArray(sequenceChunk) ? sequenceChunk.filter(Boolean) : [];
  const speech = sequence
    .filter((item) => item.type === 'speech' && item.text)
    .map((item) => item.text)
    .join(' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  const firstAvatarState = sequence.find((item) => item.type === 'avatar' || item.type === 'act') || null;

  return {
    ...(baseResponse || {}),
    speech,
    sequence,
    firstAvatarState: firstAvatarState || baseResponse?.firstAvatarState || null,
    firstActState: firstAvatarState || baseResponse?.firstActState || null,
    fallbackText: fallbackInput || baseResponse?.fallbackText || '',
  };
}

function normalizeLegacyResponseToPhasePlan(response, fallbackInput = '') {
  const phases = [];
  const sequence = Array.isArray(response?.sequence) ? response.sequence : [];
  let currentMessageItems = [];
  let currentToolItems = [];
  let phaseCounter = 0;

  const flushMessage = () => {
    if (!currentMessageItems.length) return;
    phaseCounter += 1;
    phases.push({
      phaseId: `phase-${phaseCounter}`,
      kind: 'message',
      response: buildParsedResponseFromSequenceChunk(response, currentMessageItems, fallbackInput),
    });
    currentMessageItems = [];
  };

  const flushTools = () => {
    if (!currentToolItems.length) return;
    phaseCounter += 1;
    phases.push({
      phaseId: `phase-${phaseCounter}`,
      kind: 'tool_batch',
      sequence: currentToolItems.slice(),
    });
    currentToolItems = [];
  };

  for (const item of sequence) {
    const isMessageItem = ['speech', 'avatar', 'act', 'delay'].includes(item?.type);
    if (isMessageItem) {
      flushTools();
      currentMessageItems.push(item);
    } else {
      flushMessage();
      currentToolItems.push(item);
    }
  }

  flushMessage();
  flushTools();

  if (!phases.length) {
    phases.push({
      phaseId: 'phase-1',
      kind: 'final',
      response: buildParsedResponseFromSequenceChunk(response, sequence, fallbackInput),
    });
  } else if (!phases.some((phase) => phase.kind === 'tool_batch')) {
    phases[phases.length - 1].kind = 'final';
  }

  return {
    format: 'legacy',
    raw: response?.raw || '',
    reasoning: response?.reasoning || '',
    phases,
    response,
  };
}

function parsePhasePlan(rawOutput, fallbackInput, options = {}) {
  const raw = String(rawOutput || '').replace(/\r/g, '').trim();
  const reasoning = parseReasoningSegments(raw).join('\n\n');
  const sanitizedRaw = sanitizeModelJsonEnvelope(raw);

  const tryRootObject = (source) => {
    if (!source) return null;
    const direct = (source.startsWith('{') || source.startsWith('[')) ? tryParseJsonAt(source, 0) : null;
    if (direct && direct.endIndex === source.length && direct.json && typeof direct.json === 'object' && !Array.isArray(direct.json)) {
      return direct.json;
    }
    const loose = parseLooseJsonObject(source);
    return loose && typeof loose === 'object' && !Array.isArray(loose) ? loose : null;
  };

  const root = tryRootObject(raw) || tryRootObject(sanitizedRaw);
  if (!root || !Array.isArray(root.phases)) {
    const response = parseInlineResponse(rawOutput, fallbackInput, options);
    return normalizeLegacyResponseToPhasePlan(response, fallbackInput);
  }

  const phases = [];
  root.phases.forEach((phase, index) => {
    if (!phase || typeof phase !== 'object') return;
    const kind = String(phase.kind || phase.type || 'message').trim().toLowerCase();
    const phaseId = String(phase.phaseId || phase.id || `phase-${index + 1}`).trim() || `phase-${index + 1}`;

    if (kind === 'status') {
      const statusText = normalizeSpeechText(String(phase.text || phase.message || ''));
      if (statusText) {
        phases.push({
          phaseId,
          kind: 'status',
          statusText,
          speak: phase.speak === true || phase.tts === true || phase.voice === true,
        });
      }
      return;
    }

    const segmentList = Array.isArray(phase.segments) ? phase.segments : Array.isArray(phase.timeline) ? phase.timeline : Array.isArray(phase.steps) ? phase.steps : [];

    const parsedResponse = buildParsedResponseFromJsonSegments(
      segmentList.map((segment) => {
        if (!segment || typeof segment !== 'object') return null;
        if (segment.type === 'avatar') {
          return {
            type: 'avatar',
            state: segment,
          };
        }
        if (segment.type === 'speech') return { type: 'speech', text: segment.text };
        if (segment.type === 'tool' || segment.type === 'action') {
          return { type: 'tool', tool: { tool: segment.tool, args: segment.args || {} } };
        }
        return null;
      }).filter(Boolean),
      raw,
      fallbackInput,
      reasoning,
      { format: 'phases' }
    );

    if (kind === 'tool_batch') {
      phases.push({
        phaseId,
        kind,
        sequence: Array.isArray(parsedResponse.sequence) ? parsedResponse.sequence.filter((item) => item.type && !['speech', 'avatar', 'act', 'delay'].includes(item.type)) : [],
      });
      return;
    }

    if (kind === 'blocked') {
      phases.push({ phaseId, kind, response: parsedResponse, shouldPause: true });
      return;
    }

    if (kind === 'final') {
      phases.push({ phaseId, kind: 'final', response: parsedResponse });
      return;
    }

    phases.push({ phaseId, kind: 'message', response: parsedResponse });
  });

  if (!phases.length) {
    const response = parseInlineResponse(rawOutput, fallbackInput, options);
    return normalizeLegacyResponseToPhasePlan(response, fallbackInput);
  }

  return { format: 'phases', raw, reasoning, phases };
}

function parseInlineResponse(rawOutput, fallbackInput, options = {}) {
  const raw = String(rawOutput || '').replace(/\r/g, '').trim();
  const reasoning = parseReasoningSegments(raw).join('\n\n');

  const {
    matchedJson,
    tools: jsonTools,
    speech: jsonSpeech,
    segments: jsonSegments,
    preActionSpeech: jsonPreActionSpeech,
    postActionSpeech: jsonPostActionSpeech,
  } = parseJsonToolCalls(raw);

  if (matchedJson) {
    return buildParsedResponseFromJsonSegments(jsonSegments, raw, fallbackInput, reasoning, {
      format: 'json',
      preActionSpeech: jsonPreActionSpeech,
      postActionSpeech: jsonPostActionSpeech,
    });
  }

  const speechText = normalizeSpeechText(parseStructuredField(raw, 'ASSISTANT_TEXT') || raw);
  const emojiEmotion = resolveEmotionFromEmoji(raw);
  const firstAvatarState = emojiEmotion
    ? {
        type: 'avatar',
        emotion: emojiEmotion,
        intensity: 0.72,
        motion: EMOTION_TO_AVATAR_STYLE[emojiEmotion]?.motion || null,
        motionType: EMOTION_TO_AVATAR_STYLE[emojiEmotion]?.motionType || null,
        expression: EMOTION_TO_AVATAR_STYLE[emojiEmotion]?.expression || emojiEmotion,
        motionSpecified: false,
      }
    : null;

  return {
    format: 'json',
    raw,
    speech: speechText,
    reasoning,
    sequence: [
      ...(firstAvatarState ? [firstAvatarState] : []),
      { type: 'speech', text: speechText },
    ],
    firstAvatarState,
    firstActState: firstAvatarState,
  };
}

module.exports = {
  parseReasoningSegments,
  stripTrailingIncompleteControls,
  extractSpeechPreview,
  parseJsonToolCalls,
  tryParseJsonAt,
  extractToolsFromJson,
  mapJsonToolToSequence,
  buildParsedResponseFromJsonSegments,
  buildParsedResponseFromSequenceChunk,
  normalizeLegacyResponseToPhasePlan,
  parsePhasePlan,
  parseInlineResponse,
  sanitizeModelJsonEnvelope,
  parseStructuredField,
  parseActPayload,
  resolveEmotionFromEmoji,
  parseLooseJsonObject,
};
