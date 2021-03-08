/* eslint-disable no-plusplus,node/no-unsupported-features */

const winston = require('winston');
const _ = require('lodash');
const { MESSAGE } = require('triple-beam');

const defaultOptions = {
    handleExceptions: false,
    showNamespace: false,
    level: 'debug',
    namespaces: 'codefresh,codefresh:*',
    consoleOptions: null,
    basePath: '',
    baseNamespace: 'codefresh',
    fields: {},
};

let globalOptions = defaultOptions;
const names = [];
const skips = [];

const setGlobalOptions = function (options) {
    if (!options) {
        throw new Error('failed to set globalOptions because no options object was provided');
    }

    if (options.level) {
        if (typeof options.level !== 'string') {
            throw new Error('failed to set globalOptions because debug must be a string');
        }
        const levels = /error|warn|info|debug/;
        if (!levels.test(options.level)) {
            throw new Error('failed to set globalOptions because debug can only be one of these values: error/warn/info/debug');
        }
    }

    globalOptions = _.assign(_.cloneDeep(defaultOptions), options);
    defaultLogger.resetLevel();
};

const parseNamespacesFromEnvironment = function () {
    const namespaces = process.env.DEBUG || globalOptions.namespaces || '';
    const split = namespaces.split(/[\s,]+/);
    const len = split.length;

    for (let i = 0; i < len; i++) {
        // eslint-disable-next-line no-continue
        if (!split[i]) continue; // ignore empty strings

        let namespace = split[i].replace(/\*/g, '.*?');
        if (namespace[0] === '-') {
            namespace = namespace.substr(1);
            if (!skips.find(s => s.toString() === namespace)) {
                skips.push(new RegExp(`^${namespace.substr(1)}$`));
            }
        } else if (!names.find(s => s.toString() === namespace)) {
            names.push(new RegExp(`^${namespace}$`));
        }
    }
};

const isNamespaceEnabled = function (namespace) {
    let i;
    let len;

    for (i = 0, len = skips.length; i < len; i++) {
        if (skips[i].test(namespace)) {
            return false;
        }
    }
    for (i = 0, len = names.length; i < len; i++) {
        if (names[i].test(namespace)) {
            return true;
        }
    }
    return false;
};

const Logger = function (namespace) {
    if (!namespace) {
        throw new Error('failed to create a new logger because namespace was not provided');
    }
    if (typeof namespace !== 'string') {
        throw new Error('failed to create a new logger because namespace must be a String');
    }

    if (globalOptions.basePath &&
        namespace.indexOf(globalOptions.basePath) === 0) {

        const baseNamespace = globalOptions.baseNamespace || '';
        let generatedNamespace =
            namespace.replace(new RegExp(globalOptions.basePath, 'g'), '')
                .replace(/\//g, ':')
                .replace(/\.js/g, '');
        if (generatedNamespace[0] !== ':') {
            generatedNamespace = `:${generatedNamespace}`;
        }
        namespace = baseNamespace + generatedNamespace;
    }

    parseNamespacesFromEnvironment();
    const logger = winston.createLogger();
    logger.level = globalOptions.level;

    if (globalOptions && globalOptions.consoleOptions && globalOptions.consoleOptions.formatter) {
        const formatter = {
            transform: (info, opts) => {
                info.timestamp = () => {
                    return info.time;
                };
                info[MESSAGE] = globalOptions.consoleOptions.formatter(Object.assign({}, info, opts));
                return info;
            },
        };
        globalOptions.consoleOptions.format = formatter;
    }
    if (process.env.FORMAT_LOGS_TO_NORMAL === 'true') {
        globalOptions.consoleOptions = { format: standardFormatter };
    }
    if (globalOptions && globalOptions.handleExceptions) {
        globalOptions.consoleOptions.handleExceptions = true;
        logger.add(new winston.transports.Console(globalOptions.consoleOptions));
    } else {
        logger.add(
            new winston.transports.Console(Object.assign({}, globalOptions.consoleOptions))
        );
        // logger.configure({transports: [new winston.transports.Console(Object.assign({}, globalOptions.consoleOptions))]});
    }

    logger.exitOnError = true;

    const addSpecificArguments = function (oldArguments) {
        if (isNamespaceEnabled(namespace) || namespace === 'CF_LOGS_DEFAULT') {
            const data = {};
            if (globalOptions.showNamespace && namespace !== 'CF_LOGS_DEFAULT') {
                data.namespace = namespace;
            }
            if (globalOptions.fields) {
                _.map(globalOptions.fields, (value, key) => {
                    if (_.isFunction(value)) {
                        if (key === 'authenticatedEntity') {
                            const authEntity = value();
                            if (_.get(authEntity, 'activeAccount.features')){
                                delete authEntity.activeAccount.features;
                            }
                            data[key] = authEntity;
                        } else {
                            data[key] = value();
                        }
                    } else {
                        data[key] = value;
                    }
                });
            }
            oldArguments.push({ meta: data });
            return oldArguments;
        }
        return false;
    };

    const resetLevel = function () {
        logger.level = globalOptions.level;
    };

    const log = function (...args) {
        const mainArguments = addSpecificArguments(args);
        if (mainArguments) {
            logger.log(...mainArguments);
        }
    };
    const error = function (...args) {
        const mainArguments = addSpecificArguments(args);
        if (mainArguments) {
            logger.error(...mainArguments);
        }
    };
    const warn = function (...args) {
        const mainArguments = addSpecificArguments(args);
        if (mainArguments) {
            logger.warn(...mainArguments);
        }
    };
    const info = function (...args) {
        const mainArguments = addSpecificArguments(args);
        if (mainArguments) {
            logger.info(...mainArguments);
        }
    };
    const debug = function (...args) {
        const mainArguments = addSpecificArguments(args);
        if (mainArguments) {
            logger.debug(...mainArguments);
        }
    };

    return {
        log,
        error,
        warn,
        info,
        debug,
        Logger,
        newLoggerFromFilename: Logger,
        setGlobalOptions,
        init: setGlobalOptions,
        isNamespaceEnabled,
        resetLevel,
    };
};

const standardFormatter = winston.format.printf((info) => {
    const { meta, level, message } = info;
    const { authenticatedEntity, time } = (meta || {});
    const userName = authenticatedEntity && authenticatedEntity.name;
    const accountName = authenticatedEntity && authenticatedEntity.activeAccount && authenticatedEntity.activeAccount.name;
    const namespace = meta && meta.namespace;
    info.message = `${time} ${level} ` +
        `${namespace ? `[${meta.namespace}]` : ''}` +
        `${accountName ? `[${accountName}]` : ''}` +
        `${userName ? `[${userName}]` : ''}` +
        ` ${message}`;
    return info.message;
});

const defaultLogger = Logger('CF_LOGS_DEFAULT');
module.exports = defaultLogger;
