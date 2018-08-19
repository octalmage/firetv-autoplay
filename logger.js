module.exports = class Logger {
  constructor() {
    this.previousLine = '';
  }

  log(text) {
    if (this.previousLine !== text) {
      console.log(text);
      this.previousLine = text;
    }
  }
};
