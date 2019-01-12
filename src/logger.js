module.exports = class Logger {
  constructor() {
    this.previousLine = '';
  }

  info(text) {
    if (this.previousLine !== text) {
      console.log(text);
      this.previousLine = text;
    }
  }
};
