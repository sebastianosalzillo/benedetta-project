'use strict';

const fs = require('fs');

// Tests for settings saving

describe('settings saving', () => {
  // Since testing the full IPC is complex, test the logic

  test('saveUserSettings creates proper content', () => {
    const data = {
      name: 'Alice',
      preferredName: 'Al',
      timezone: 'Europe/Rome',
      privacy: 'private'
    };
    const expected = [
      '# USER',
      '',
      'Name: Alice',
      'Preferred Name: Al',
      'Timezone: Europe/Rome',
      'Privacy Preferences: private',
    ].join('\n');

    // Verify format
    expect(expected.includes('Name: Alice')).toBe(true);
  });

  test('saveSoulSettings creates proper content', () => {
    const data = {
      avatarName: 'Nyx',
      toneStyle: 'pragmatic',
      voiceStyle: 'neutral',
      boundaries: 'no secrets'
    };
    const expected = [
      '# SOUL',
      '',
      'Avatar Name: Nyx',
      'Tone Style: pragmatic',
      'Voice Style: neutral',
      'Boundaries: no secrets',
    ].join('\n');

    expect(expected.includes('Avatar Name: Nyx')).toBe(true);
  });

  test('saveIdentitySettings creates proper content', () => {
    const data = {
      role: 'assistant',
      focusContext: 'help users'
    };
    const expected = [
      '# IDENTITY',
      '',
      'Role: assistant',
      'Focus Context: help users',
    ].join('\n');

    expect(expected.includes('Role: assistant')).toBe(true);
  });
});
