#!/usr/bin/env node

const adb = require('adbkit');
const client = adb.createClient();
const program = require('commander');
const inquirer = require('inquirer');
const restify = require('restify');
const pjson = require('./package.json');
const Logger = require('./logger');
require('log-timestamp');

const server = restify.createServer({
  name: 'firetv-autoplay',
  version: pjson.version,
});

let ip;
const log = new Logger();
const PLAYSTATE_UNKNOWN = 0;
const PLAYSTATE_PAUSED = 2;
const PLAYSTATE_PLAYING = 3;

let globalState;
let loopPaused = false;

program
  .version(pjson.version)
  .arguments('[ip]')
  .option('-a, --api', 'Enable HTTP API')
  .action(function (passedIp) {
     ip = passedIp;
  })
  .parse(process.argv);

const sleep = (ms) => () => new Promise(resolve => setTimeout(resolve, ms));

client.listDevices()
.then((devices) => {
  let device;
  if (ip) {
    const id = `${ip}:5555`;
    // Loop for IP in list.
    const filteredDevices = devices.filter(e => e.id === id);
    if (filteredDevices.length > 0) {
      return filteredDevices[0];
    } else {
      return client.connect(ip)
      // Return device object to match what adbkit returns.
      .then(id => ({ id, type: 'device' }));
    }
  } else if (devices.length === 1) { // Only one device and no IP passed, so just connect.
    return devices[0];
  } else if (devices.length > 0) { // More than one device and no IP passed, ask which device to connect to.
    return inquirer.prompt([{
      type: 'list',
      name: 'device',
      message: 'Which Fire TV would you like to pair with?',
      choices: devices.map(d => {
        return {
          name: d.id,
          value: d.id
        };
      })
    }])
    .then((answers) => {
      const id = answers['device'];
      return devices.filter(device => { return device.id == id; })[0];
    });
  } else {
    throw new Error('No devices found.');
  }
})
.then(device => {
  // Only start server if API flag is set.
  if (!program.api) {
    return device;
  }

  server.use(restify.plugins.acceptParser(server.acceptable));
  server.use(restify.plugins.queryParser());
  server.use(restify.plugins.bodyParser());

  server.get('/input/:key', function (req, res, next) {
    const { params: { key }} = req;

    let promise = Promise.resolve();
    if (key === '85')   {
      if (globalState === PLAYSTATE_PLAYING) {
        loopPaused = true;
      } else if (globalState === PLAYSTATE_UNKNOWN) {
        loopPaused = false;
      }
    }

    log.info(`API: pressing ${key}`);
    return promise
      .then(() => pressKey(client, device, key))
      .then(() => {
        res.send(`key ${key} clicked!`);
        return next();
      });
  });

  server.listen(8811, function () {
    console.log('%s listening at %s', server.name, server.url);
  });

  return device;
})
.then(device => loop(Promise.resolve(), () => playIfNotPlaying(client, device).then(sleep(1000))))
.catch(function(err) {
  console.error('Something went wrong:', err.stack)
})

function loop(promise, fn) {
  return promise.then(fn).then(function (value) {
    return loop(Promise.resolve(value), fn);
  });
}

// Get playing state:
// State 3 is playing, state 2 is pasued.
// Reference: https://developer.android.com/reference/android/media/AudioTrack#PLAYSTATE_PLAYING
const playIfNotPlaying = (client, device) => getPlayingState(client, device)
.then(({ state, device }) => {
  if (state === PLAYSTATE_PLAYING) {
    globalState = PLAYSTATE_PLAYING;
  } else {
    globalState = PLAYSTATE_UNKNOWN;
  }

  // Listen to global variable for pausing.
  if (loopPaused) {
    return;
  }

  if (state === PLAYSTATE_UNKNOWN) {
    log.info('Unknown state');
    return state;
  } if (state !== PLAYSTATE_PLAYING) {
    log.info('Paused, waiting for 5 seconds before pressing play');
    return sleep(5000)()
    .then(() => getPlayingState(client, device))
    .then(({ state }) => {
      if (state !== PLAYSTATE_PLAYING) {
        log.info('Paused, pressing play');
        return pressTrackball(client, device)
        .then(() => state);
      }
    });
  }
  log.info('Playing');
  return state;
});

const getPlayingState = (client, device) => getCurrentApp(client, device)
// Use the readAll() utility to read all the content without
// having to deal with the events. `output` will be a Buffer
// containing all the output.
.then(({ device, app }) => {
  switch(app) {
    case 'com.netflix.ninja':
      return getPlayingStateNetflix(client, device);
    case 'com.hulu.plus':
      return getPlayingStateHulu(client, device);
    default:
      return { device, state: PLAYSTATE_UNKNOWN };
  }
});

const getPlayingStateHulu = (client, device) => client.shell(device.id, 'dumpsys audio')
.then(adb.util.readAll)
.then(function(output) {
  let state = PLAYSTATE_PAUSED;
  if (output.includes('source:android.os.BinderProxy')) {
    state = PLAYSTATE_PLAYING
  }

  return { device, state };
});

const getPlayingStateNetflix = (client, device) => client.shell(device.id, 'dumpsys media_session')
.then(adb.util.readAll)
.then(function(output) {
  const matches = /state=PlaybackState.*state=(\d)/gm.exec(output);
  let state = PLAYSTATE_UNKNOWN;
  if (matches) {
    state = parseInt(matches[1]);
  }

  return { device, state };
});

const pressPlay = (client, device) => pressKey(client, device, '85');

const pressKey = (click, device, key) => client.shell(device.id, `input keyevent ${key}`)
.then(adb.util.readAll) // Wait for event to close.
.then(() => { device });

const pressTrackball = (client, device) => client.shell(device.id, 'input press')
.then(adb.util.readAll) // Wait for event to close.
.then(() => { device });

const getCurrentApp = (client, device) => client.shell(device.id, 'dumpsys activity recents')
.then(adb.util.readAll)
.then(function(output) {
  const matches = /Recent #0.*A=(.*) U/g.exec(output);
  let app;
  if (matches) {
    app = matches[1];
  }
  return { device, app };
});
