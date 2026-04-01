# Avatar Nyx — Complete Capabilities Reference

## 😊 EMOJI → Facial Expressions (55 total)

The TalkingHead engine automatically detects emojis in spoken text and converts them into animated facial expressions. These are **transient** animations queued during speech, not persistent moods.

### Neutral / Expressionless
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😐 | neutral | Straight face: brow inner up, wide eyes, pressed mouth |
| 😶 | neutral | Same as 😐 (speechless) |

### Smirking / Smug
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😏 | smirk | Asymmetric squint, one brow up, nose sneer, head turned |
| 😒 | unamused | Eye contact off, asymmetric squint, brow up, frown |

### Slight Smile
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 🙂 | slight_smile | mouthSmile: 0.5 |
| 🙃 | slight_smile | Same as 🙂 (upside-down) |

### Warm Smile / Blushing
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😊 | warm_smile | Brow inner up, full squint, strong smile, nose sneer |
| 😇 | warm_smile | Same as 😊 (angel) |
| 🥰 | warm_smile | Same as 😊 (hearts) |

### Grinning
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😀 | grinning | Brow up, slight jaw open, dimples, open mouth, smile |
| 😃 | grinning_big_eyes | Same as 😀 with wide eyes |
| 😄 | grinning_smile_eyes | Same as 😀 with full squint |
| 😁 | beaming_grin | Same as 😄 with more jaw open |
| 😆 | squinting_laugh | Same as 😁 with eyes closed |
| 😍 | heart_eyes | Same as 😀 (heart eyes) |
| 🤩 | star_struck | Same as 😍 |

### Tongue Out / Playful
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😝 | tongue_out | Closed eyes, wide smile, jaw open, tongue out |
| 😋 | tongue_out | Same as 😝 (yum) |
| 😛 | tongue_out | Same as 😝 |
| 😜 | tongue_out | Same as 😝 (winking) |
| 🤪 | tongue_out | Same as 😝 (zany) |

### Laughing / Tears
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😂 | laughing_tears | Squint, closed eyes, jaw open, dimples, smile |
| 🤣 | laughing_tears | Same as 😂 (ROFL) |
| 😅 | laughing_tears | Same as 😂 (nervous sweat) |

### Winking
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😉 | wink | Smile, one eye blink, brow down, cheek squint, head tilt |

### Crying / Sadness
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😭 | loud_crying | Full squint, eyes nearly closed, mouth open, frown |
| 🥺 | pleading | Full brow inner up, wide eyes, frown, pucker |
| 😞 | disappointed | Full squint, eyes closed, head tilted down, frown |
| 😔 | pensive | Full squint, eyes closed, head tilted down, frown |
| ☹️ | frowning | Full frown, slight pucker, rolled mouth |

### Flushed / Embarrassed
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😳 | flushed | Full brow up, wide eyes, funnel mouth, pucker |

### Kissing
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😚 | kissing_closed | Brow up, full squint, blink, pucker, viseme U |
| 😘 | blowing_kiss | Squint, blink, pucker, head tilt, viseme U |

### Angry
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😡 | pouting_angry | Full brow down, eyes looking up, jaw forward, frown |
| 😠 | angry | Same as 😡 |
| 🤬 | angry | Same as 😠 (cursing) |

### Fear / Shock
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😱 | screaming_fear | Brow up, wide eyes, jaw wide open, funnel mouth |

### Grimacing
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😬 | grimace | Full brow down+inner up, dimples, pressed mouth, pucker |

### Eye Roll
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 🙄 | eye_roll | Brow up, wide eyes, eyes rotated up, head tilted |

### Thinking
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 🤔 | thinking | Asymmetric brow, squint, frown, hand to chin gesture |

### Eyes
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 👀 | eyes | Eyes rotate horizontally (looking side to side) |

### Sleeping
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| 😴 | sleeping | Eyes fully closed, head tilted forward/sideways (5s) |

### Hand Gestures
| Emoji | Internal Name | Description |
|-------|---------------|-------------|
| ✋ | hand_up | Smile + handup gesture (2s, both hands) |
| 👋 | hand_up | Same waving gesture |
| 🤚 | hand_up | Same (one hand) |
| 👍 | thumbs_up | Smile + thumbup gesture (2s) |
| 👎 | thumbs_down | Angry + thumbdown gesture (2s) |
| 👌 | ok | Smile + ok gesture (2s) |
| 🤷‍♂️ | shrug | Shrug gesture (2s) |
| 🤷‍♀️ | shrug | Same shrug |
| 🤷 | shrug | Same shrug |
| 🙏 | namaste | Blink, head tilt, namaste gesture (2s) |

### Text Tokens
| Token | Description |
|-------|-------------|
| `yes` | Head nodding (4 oscillations) |
| `no` | Head shaking (5 oscillations) |

---

## 🎭 MOOD PERSISTENTI (8 total)

Persistent baseline states set via `head.setMood(mood)`. Unlike emoji animations, these are **continuous** states.

| Mood | Internal Name | Description |
|------|---------------|-------------|
| 😐 Neutral | `neutral` | Relaxed, eyes slightly down, normal breathing |
| 😊 Happy | `happy` | Smile 0.2, eyes down, slightly higher speech pitch |
| 😡 Angry | `angry` | Brow down, jaw forward, frown, faster breathing |
| 😢 Sad | `sad` | Brow inner up, squint, frown, pucker, head down |
| 😱 Fear | `fear` | Brow up, wide eyes, funnel mouth |
| 🤢 Disgust | `disgust` | Nose sneer, mouth twisted |
| 😍 Love | `love` | Warm smile, eyes squinted |
| 😴 Sleep | `sleep` | Eyes closed, head tilted |

---

## 🧍 POSE (11 total)

Set via `head.playPose(name)`. Internal poses from TalkingHead + siteconfig.js.

| Pose | Key | Description |
|------|-----|-------------|
| Straight | `straight` | Standing straight, frontal |
| Side | `side` | Leaning to the side |
| Hip | `hip` | Weight on hip |
| Turn | `turn` | Turned sideways |
| Back | `back` | Facing away |
| Wide | `wide` | Wide stance |
| OneKnee | `oneknee` | On one knee |
| TwoKnees | `kneel` | Kneeling on both knees |
| Bend | `bend` | Bent forward |
| Sitting | `sitting` | Seated |
| Dance | `dance` | Dance pose (FBX) |

---

## 🤟 GESTI (8 total)

Set via `head.playGesture(name)`. Hand gestures, default left hand (mirror=true for right).

| Gesture | Key | Description |
|---------|-----|-------------|
| HandUp | `handup` | Hand raised |
| OK | `ok` | OK sign |
| Index | `index` | Pointing with index finger |
| ThumbUp | `thumbup` | Thumbs up |
| ThumbDown | `thumbdown` | Thumbs down |
| Side | `side` | Pointing to the side |
| Shrug | `shrug` | Shrug shoulders |
| Namaste | `namaste` | Hands together (prayer) |

---

## 🎬 ANIMAZIONI

Set via `head.playAnimation(url)`. Mixamo FBX animations.

| Animation | File | Description |
|-----------|------|-------------|
| Walking | `walking` | Walking animation |
| Custom | Any Mixamo FBX | 2000+ animations available |

---

## 🗣️ COMANDI AVATAR (6 total)

Sent via IPC `avatar-command` from main process to renderer.

| Command | Parameters | What it does |
|---------|------------|--------------|
| `speak` | `audioBase64`, `expectedDurationMs` | Play audio with lip-sync |
| `mood` | `mood` (string) | Set persistent mood |
| `motion` | `motion`, `motionType` | Change pose/animation |
| `gesture` | `gesture` (string) | Execute hand gesture |
| `status` | `text` (string) | Show floating status bubble (3.5s) |
| `stop` | — | Stop current speech |

---

## 🤖 ACP TOKEN FORMAT

The brain emits these tokens to control the avatar:

### ACT Token
```
<|ACT:{"emotion":"happy","gesture":"thumbup","intensity":0.8}|>
<|ACT:neutral|>
<|ACT:null|>
```

### DELAY Token
```
<|DELAY:1.5|>
```

### Emoji Auto-Detection
When the brain outputs emojis like 😊😂🤔 in its response text, they are automatically detected and converted to facial expressions during speech.
