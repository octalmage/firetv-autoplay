// @flow
const adb = require('adbkit');
const Logger = require('./logger');

const log = new Logger();

const PLAYSTATE_UNKNOWN = 0;
const PLAYSTATE_PAUSED = 2;
const PLAYSTATE_PLAYING = 3;

const STATE = {
  PLAYSTATE_UNKNOWN,
  PLAYSTATE_PAUSED,
  PLAYSTATE_PLAYING,
};

export type State = $Values<typeof STATE>;

export type Device = {
  id: number,
  type: 'device',
};

let globalState: State;
const loopPaused = false;

const sleep = (ms: number) => () => (new Promise(resolve => setTimeout(resolve, ms)): any);

const pressKey = (client: any, device: Device, key: string) => client
  .shell(device.id, `input keyevent ${key}`)
  .then(adb.util.readAll) // Wait for event to close.
  .then(() => ({
    device,
  }));

// const pressPlay = (passedClient, device) => pressKey(passedClient, device, '85');

const pressTrackball = (client: any, device: Device) => client
  .shell(device.id, 'input press')
  .then(adb.util.readAll) // Wait for event to close.
  .then(() => ({
    device,
  }));

const getPlayingStateHulu = (client: any, device: Device) => client
  .shell(device.id, 'dumpsys audio')
  .then(adb.util.readAll)
  .then((output) => {
    let state = PLAYSTATE_PAUSED;
    if (output.includes('source:android.os.BinderProxy')) {
      state = PLAYSTATE_PLAYING;
    }

    return { device, state };
  });

const getPlayingStateNetflix = (client: any, device: Device) => client
  .shell(device.id, 'dumpsys media_session')
  .then(adb.util.readAll)
  .then((output) => {
    let state = PLAYSTATE_UNKNOWN;
    const stringOutput = output.toString('utf8');
    const searchString = 'com.netflix.ninja/Netflix media session';
    const index = stringOutput.search(searchString);
    // Trim anything before the Netflix output.
    const netflixOutput = stringOutput.substring(index, stringOutput.length);
    // Find the current PlaybackState.
    const matches = /state=PlaybackState.*state=(\d)/gm.exec(netflixOutput);
    if (matches) {
      state = parseInt(matches[1], 10);
    }

    return { device, state };
  });

const getCurrentApp = (passedClient: any, device: Device) => passedClient
  .shell(device.id, 'dumpsys activity recents')
  .then(adb.util.readAll)
  .then((output) => {
    const matches = /Recent #0.*A=(.*) U/g.exec(output);
    let app;
    if (matches) {
      // Grab index 1.
      [, app] = matches;
    }
    return { device, app };
  });

const getPlayingState = (passedClient: any, device: Device) => getCurrentApp(passedClient, device)
// Use the readAll() utility to read all the content without
// having to deal with the events. `output` will be a Buffer
// containing all the output.
  .then(({ app }) => {
    switch (app) {
      case 'com.netflix.ninja':
        return getPlayingStateNetflix(passedClient, device);
      case 'com.hulu.plus':
        return getPlayingStateHulu(passedClient, device);
      default:
        return { device, state: PLAYSTATE_UNKNOWN };
    }
  });

// Get playing state:
// State 3 is playing, state 2 is pasued.
// Reference: https://developer.android.com/reference/android/media/AudioTrack#PLAYSTATE_PLAYING
const playIfNotPlaying = (
  passedClient: any,
  device: Device,
): Promise<State> => getPlayingState(passedClient, device)
  .then(({ state }) => {
    if (state === PLAYSTATE_PLAYING) {
      globalState = PLAYSTATE_PLAYING;
    } else {
      globalState = PLAYSTATE_UNKNOWN;
    }

    // Listen to global variable for pausing.
    if (loopPaused) {
      return state;
    }

    if (state === PLAYSTATE_UNKNOWN) {
      log.info('Unknown state');
      return state;
    }
    if (state !== PLAYSTATE_PLAYING) {
      log.info('Paused, waiting for 5 seconds before pressing play');
      return sleep(5000)()
        .then(() => getPlayingState(passedClient, device))
        .then(({ state: newState }) => {
          if (newState !== PLAYSTATE_PLAYING) {
            log.info('Paused, pressing play');
            return pressTrackball(passedClient, device).then(() => newState);
          }

          return Promise.resolve();
        });
    }
    log.info('Playing');
    return state;
  });

const loop = (promise: Promise<any>, fn: Function) => promise
  .then(fn)
  .then(value => loop(Promise.resolve(value), fn));

module.exports = {
  loop,
  loopPaused,
  sleep,
  globalState,
  playIfNotPlaying,
  getCurrentApp,
  getPlayingState,
  getPlayingStateHulu,
  getPlayingStateNetflix,
  pressKey,
  pressTrackball,
  PLAYSTATE_PAUSED,
  PLAYSTATE_PLAYING,
  PLAYSTATE_UNKNOWN,
};
