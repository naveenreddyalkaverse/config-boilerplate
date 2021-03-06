import _ from 'lodash';
import Path from 'path';
import FS from 'fs';

// External libraries are lazy-loaded
// only if these file types exist.
let Yaml = null;
let VisionmediaYaml = null;
let CSON = null;
let PPARSER = null;
let JSON5 = null;
let TOML = null;
let HJSON = null;

/* eslint-disable import/no-unresolved */

class Util {
    static stripYamlComments(fileStr) {
        // First replace removes comment-only lines
        // Second replace removes blank lines
        return fileStr.replace(/^\s*#.*/mg, '').replace(/^\s*[\n|\r]+/mg, '');
    }

    static stripComments(fileStr, stringRegex) {
        stringRegex = stringRegex || /(['"])(\\\1|.)+?\1/g;

        const uid = `_${Date.now()}`;
        const primitives = [];
        let primIndex = 0;

        return (
          fileStr

          /* Remove strings */
            .replace(stringRegex, (match) => {
                primitives[primIndex] = match;
                return `${uid}${primIndex++}`;
            })

            /* Remove Regexes */
            .replace(/([^\/])(\/(?!\*|\/)(\\\/|.)+?\/[gim]{0,3})/g, (match, matchOne, matchTwo) => {
                primitives[primIndex] = matchTwo;
                return `${matchOne}${uid}${primIndex++}`;
            })

            /*
             - Remove single-line comments that contain would-be multi-line delimiters
             E.g. // Comment /* <--
             - Remove multi-line comments that contain would be single-line delimiters
             E.g. /* // <--
             */
            .replace(/\/\/.*?\/?\*.+?(?=\n|\r|$)|\/\*[\s\S]*?\/\/[\s\S]*?\*\//g, '')

            /*
             Remove single and multi-line comments,
             no consideration of inner-contents
             */
            .replace(/\/\/.+?(?=\n|\r|$)|\/\*[\s\S]+?\*\//g, '')

            /*
             Remove multi-line comments that have a replaced ending (string/regex)
             Greedy, so no inner strings/regexes will stop it.
             */
            .replace(new RegExp(`\\/\\*[\\s\\S]+${uid}\\d+`, 'g'), '')

            /* Bring back strings & regexes */
            .replace(new RegExp(`${uid}(\\d+)`, 'g'), (match, matchOne) => primitives[matchOne])
        );
    }

    static parseFile(fullFilename) {
        // Initialize
        const extension = fullFilename.substr(fullFilename.lastIndexOf('.') + 1);
        let configObject = null;
        let fileContent = null;

        // Return null if the file doesn't exist.
        // Note that all methods here are the Sync versions.  This is appropriate during
        // module loading (which is a synchronous operation), but not thereafter.
        try {
            const stat = FS.statSync(fullFilename);
            if (!stat || stat.size < 1) {
                return null;
            }
        } catch (e1) {
            return null;
        }

        // Try loading the file.
        try {
            fileContent = FS.readFileSync(fullFilename, 'UTF-8');
            fileContent = fileContent.replace(/^\uFEFF/, '');
        } catch (e2) {
            throw new Error(`Config file ${fullFilename} cannot be read`);
        }

        // Parse the file based on extension
        try {
            configObject = Util.parseString(fileContent, extension);
        } catch (e3) {
            throw new Error(`Cannot parse config file: '${fullFilename}': ${e3}`);
        }

        return configObject;
    }

    static parseString(content, format) {
        let configObject = null;

        // Parse the file based on extension
        if (format === 'yaml' || format === 'yml') {
            if (!Yaml && !VisionmediaYaml) {
                // Lazy loading
                try {
                    // Try to load the better js-yaml module
                    Yaml = require('js-yaml');
                } catch (e) {
                    try {
                        // If it doesn't exist, load the fallback visionmedia yaml module.
                        VisionmediaYaml = require('yaml');
                    } catch (err) {
                        // eat error here
                    }
                }
            }

            if (Yaml) {
                configObject = Yaml.load(content);
            } else if (VisionmediaYaml) {
                // The yaml library doesn't like strings that have newlines but don't
                // end in a newline: https://github.com/visionmedia/js-yaml/issues/issue/13
                content += '\n';
                configObject = VisionmediaYaml.eval(Util.stripYamlComments(content));
            } else {
                console.error('No YAML parser loaded.  Suggest adding js-yaml dependency to your package.json file.');
            }
        } else if (format === 'json') {
            try {
                configObject = JSON.parse(content);
            } catch (e) {
                // All JS Style comments will begin with /, so all JSON parse errors that
                // encountered a syntax error will complain about this character.
                if (e.name !== 'SyntaxError' || e.message !== 'Unexpected token /') {
                    throw e;
                }

                if (!JSON5) {
                    JSON5 = require('json5');
                }

                configObject = JSON5.parse(content);
            }
        } else if (format === 'json5') {
            if (!JSON5) {
                JSON5 = require('json5');
            }

            configObject = JSON5.parse(content);
        } else if (format === 'hjson') {
            if (!HJSON) {
                HJSON = require('hjson');
            }

            configObject = HJSON.parse(content);
        } else if (format === 'toml') {
            if (!TOML) {
                TOML = require('toml');
            }

            configObject = TOML.parse(content);
        } else if (format === 'cson') {
            if (!CSON) {
                CSON = require('cson');
            }
            // Allow comments in CSON files
            if (typeof CSON.parseSync === 'function') {
                configObject = CSON.parseSync(Util.stripComments(content));
            } else {
                configObject = CSON.parse(Util.stripComments(content));
            }
        } else if (format === 'properties') {
            if (!PPARSER) {
                PPARSER = require('properties');
            }

            configObject = PPARSER.parse(content, {namespaces: true, variables: true, sections: true});
        }

        return configObject;
    }

    static initParam(paramName, defaultValue) {
        return Util.commandLineArg(paramName) || process.env[paramName] || defaultValue;
    }

    static commandLineArg(searchFor) {
        const cmdLineArgs = process.argv.slice(2, process.argv.length);
        const argName = `--${searchFor}=`;

        for (let argvIt = 0; argvIt < cmdLineArgs.length; argvIt++) {
            if (cmdLineArgs[argvIt].indexOf(argName) === 0) {
                return cmdLineArgs[argvIt].substr(argName.length);
            }
        }

        return false;
    }

    static _get(object, property) {
        if (_.isUndefined(object) || _.isNull(object) || !_.isObject(object)) {
            return undefined;
        }

        return _.get(object, property);
    }
}

const ExtNames = _.reverse(['json', 'json5', 'hjson', 'toml', 'yaml', 'yml', 'cson', 'properties']);

class ConfigInternal {
    constructor(configNamespace, ...configPaths) {
        // Initialize parameters from command line, environment, or default
        this.NODE_ENV = Util.initParam('NODE_ENV', 'development');

        this.CONFIG_NAMESPACE = configNamespace;

        if (!configPaths) {
            let path = Util.initParam('NODE_CONFIG_DIR', Path.join(process.cwd(), 'config'));
            if (path.indexOf('.') === 0) {
                path = Path.join(process.cwd(), path);
            }

            this.CONFIG_PATHS = [path];
        } else {
            this.CONFIG_PATHS = [];
            _.forEach(configPaths, path => {
                this.CONFIG_PATHS.push(path);
            });
        }

        let config = null;
        if (this.CONFIG_PATHS.length > 1) {
            const configs = _.map(this.CONFIG_PATHS, path => this.loadFileConfigs(path));
            config = _.defaultsDeep({}, ...configs);
        } else {
            config = this.loadFileConfigs(this.CONFIG_PATHS[0]);
        }

        this.config = config;
    }

    loadFileConfigs(path) {
        const config = {};

        // Read each file in turn
        const baseNames = ['default', this.NODE_ENV, 'local', `local-${this.NODE_ENV}`];

        const configs = [];

        _(baseNames).reverse().forEach(baseName => {
            _(ExtNames).forEach(extName => {
                const fullFilename = Path.join(path, `${baseName}.${extName}`);
                const configObj = Util.parseFile(fullFilename);
                if (configObj) {
                    configs.push(configObj);
                }
            });
        });

        return _.defaultsDeep(config, ...configs);
    }

    get(property) {
        if (_.isUndefined(property) || _.isNull(property)) {
            throw new Error('Calling config.get with null or undefined argument');
        }

        const value = Util._get(this.config, property);

        // Produce an exception if the property doesn't exist
        if (value === undefined) {
            throw new Error(`Configuration property "${property}" is not defined`);
        }

        // Return the value
        return value;
    }

    has(property) {
        if (_.isUndefined(property) || _.isNull(property)) {
            return false;
        }

        return (Util._get(this.config, property) !== undefined);
    }
}

export default class Config {
    constructor(namespace, ...paths) {
        this.configInternal = new ConfigInternal(namespace, ...paths);

        // copy keys from internal to here
        _(this.configInternal.config).keys().forEach(key => {
            this[key] = this.configInternal.config[key];
        });
    }

    get(property) {
        return this.configInternal.get(property);
    }

    has(property) {
        return this.configInternal.has(property);
    }
}