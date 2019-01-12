#!/usr/bin/env node
// @flow
import type { Device } from './adb';

const adb = require('adbkit');
const program = require('commander');
const inquirer = require('inquirer');
const restify = require('restify');
const Logger = require('./logger');
const {
  loop,
  sleep,
  globalState,
  playIfNotPlaying,
  pressKey,
  PLAYSTATE_UNKNOWN,
} = require('./adb');
let { loopPaused } = require('./adb'); // eslint-disable-line no-unused-vars

const pjson = require('../package.json');

require('log-timestamp');

const client = adb.createClient();

const server = restify.createServer({
  name: 'firetv-autoplay',
  version: pjson.version,
});

let ip;
const log = new Logger();

program
  .version(pjson.version)
  .arguments('[ip]')
  .option('-a, --api', 'Enable HTTP API')
  .action((passedIp) => {
    ip = passedIp;
  })
  .parse(process.argv);

client
  .listDevices()
  .then((devices: Device[]) => {
    if (ip) {
      const id = `${ip}:5555`;
      // Loop for IP in list.
      const filteredDevices = devices.filter(e => e.id === id);
      if (filteredDevices.length > 0) {
        return filteredDevices[0];
      }
      return (
        client
          .connect(ip)
          // Return device object to match what adbkit returns.
          .then(newId => ({ id: newId, type: 'device' }))
      );
    } if (devices.length === 1) {
      // Only one device and no IP passed, so just connect.
      return devices[0];
    } if (devices.length > 0) {
      // More than one device and no IP passed, ask which device to connect to.
      return inquirer
        .prompt([
          {
            type: 'list',
            name: 'device',
            message: 'Which Fire TV would you like to pair with?',
            choices: devices.map(d => ({
              name: d.id,
              value: d.id,
            })),
          },
        ])
        .then((answers) => {
          const id = answers.device;
          return devices.filter(device => device.id === id)[0];
        });
    }

    throw new Error('No devices found.');
  })
  .then((device) => {
    // Only start server if API flag is set.
    if (!program.api) {
      return device;
    }

    server.use(restify.plugins.acceptParser(server.acceptable));
    server.use(restify.plugins.queryParser());
    server.use(restify.plugins.bodyParser());

    server.get('/input/:key', (req, res, next) => {
      const {
        params: { key },
      } = req;

      const promise = Promise.resolve();
      if (key === '85') {
        if (globalState === 5) {
          loopPaused = true;
        } else if (globalState === PLAYSTATE_UNKNOWN) {
          loopPaused = false;
        }
      }

      log.info(`API: pressing ${key}`);
      return promise.then(() => pressKey(client, device, key)).then(() => {
        res.send(`key ${key} clicked!`);
        return next();
      });
    });

    server.listen(8811, () => {
      console.log('%s listening at %s', server.name, server.url);
    });

    return device;
  })
  .then(device => loop(Promise.resolve(), () => playIfNotPlaying(client, device).then(sleep(1000))))
  .catch((err) => {
    console.error('Something went wrong:', err.stack);
  });
