const ora = require('ora')

/**
 * Wraps an ora spinner, adding support for quiet and silent modes of operation
 * that essentially cause spinner operations to be noops when active. Failures
 * will still be written to stderr in quiet mode, but not in silent mode
 */
class Spinner {
  constructor(initialMessage, options={}) {
    this.options = options

    // Silent mode implies quiet mode
    if (this.options.silent) {
      this.options.quiet = true
    }

    if (!this.options.quiet) {
      this.spinner = ora(initialMessage)
    }
  }

  set text(newText) {
    if (this.spinner) {
      this.spinner.text = newText
    }
  }

  start(message) {
    if (this.spinner) {
      this.spinner.start(message)
    }

    return this
  }

  warn(message) {
    if (this.spinner) {
      this.spinner.warn(message)
    }
    else if (!this.options.silent) {
      console.error(message)
    }

    return this
  }

  fail(message) {
    if (this.spinner) {
      this.spinner.fail(message)
    }
    else if (!this.options.silent) {
      console.error(message)
    }

    return this
  }

  succeed() {
    if (this.spinner) {
      this.spinner.succeed()
    }

    return this
  }
}

module.exports = Spinner
