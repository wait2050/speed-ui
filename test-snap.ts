import { PlaybackEngine } from './src/engine/PlaybackEngine';
import * as fs from 'fs';

let timeline = [
  { type: 'action', phase: 'core', name: 'Action 1', duration: 100, bpm: 60, sound: 'tick' },
  { type: 'snap', phase: 'core' },
  { type: 'transition', signal: 'single_ding', phase: 'core' },
  { type: 'action', phase: 'core', name: 'Action 2', duration: 100, bpm: 60, sound: 'tick' },
  { type: 'end' }
];

// Let's create a script to fix PlaybackEngine.ts scheduleLoop
