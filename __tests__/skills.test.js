const { loadSkills, matchSkill, executeSkill } = require('../electron/skills');

describe('skills loader', () => {
  test('loads directory-based skills with index.js', () => {
    const skills = loadSkills();
    const codeReview = skills.find((skill) => skill.id === 'skill-code-review');

    expect(codeReview).toBeTruthy();
    expect(codeReview.name).toBe('Code Review');
  });

  test('matches the code review skill on review requests', () => {
    const skills = loadSkills();
    const matched = matchSkill(skills, 'review this code ```js\nconsole.log("x")\n```');

    expect(matched).toBeTruthy();
    expect(matched.id).toBe('skill-code-review');
  });

  test('executes the code review skill and returns findings', async () => {
    const skills = loadSkills();
    const matched = matchSkill(skills, 'review this code ```js\nconsole.log("x")\n```');
    const result = await executeSkill(matched, { text: 'review this code ```js\nconsole.log("x")\n```' });

    expect(result.ok).toBe(true);
    expect(result.result).toContain('Code Review Skill');
    expect(result.result).toContain('console.log');
  });
});
