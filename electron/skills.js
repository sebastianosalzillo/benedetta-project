const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

function createDefaultSkill(name, description, trigger, handler) {
  return {
    id: `skill-${name.replace(/\s+/g, '-').toLowerCase()}`,
    name,
    description,
    trigger,
    handler,
    enabled: true,
    priority: 0,
    createdAt: new Date().toISOString(),
  };
}

function loadSkills() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }

  const skills = [];
  const entries = fs.readdirSync(SKILLS_DIR);

  for (const entry of entries) {
    const skillPath = path.join(SKILLS_DIR, entry);
    if (!entry.endsWith('.js')) continue;

    try {
      const mod = require(skillPath);
      if (mod.name && mod.handler) {
        skills.push({
          id: mod.id || `skill-${entry.replace('.js', '')}`,
          name: mod.name,
          description: mod.description || '',
          trigger: mod.trigger || (() => false),
          handler: mod.handler,
          enabled: mod.enabled !== false,
          priority: mod.priority || 0,
        });
      }
    } catch (error) {
      console.error(`Failed to load skill ${entry}:`, error.message);
    }
  }

  skills.sort((a, b) => b.priority - a.priority);
  return skills;
}

function matchSkill(skills, userInput) {
  const input = String(userInput || '').toLowerCase();
  for (const skill of skills) {
    if (!skill.enabled) continue;

    if (typeof skill.trigger === 'function') {
      if (skill.trigger(input, userInput)) return skill;
    } else if (typeof skill.trigger === 'string') {
      if (input.includes(skill.trigger.toLowerCase())) return skill;
    } else if (skill.trigger instanceof RegExp) {
      if (skill.trigger.test(input)) return skill;
    }
  }
  return null;
}

async function executeSkill(skill, context) {
  try {
    const result = await skill.handler(context);
    return { ok: true, skill: skill.name, result };
  } catch (error) {
    return { ok: false, skill: skill.name, error: error.message };
  }
}

function listSkills(skills) {
  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    enabled: s.enabled,
    priority: s.priority,
  }));
}

module.exports = {
  createDefaultSkill,
  loadSkills,
  matchSkill,
  executeSkill,
  listSkills,
  SKILLS_DIR,
};
