const engine = {
    PDFTEX: 0,
    XETEX: 1,
    DVIPDF: 2
}


/**
 * @param {ArrayLike<number>} content
 * @return {number}
 */
function _allocate(content) {
    let res = _malloc(content.length);
    HEAPU8.set(new Uint8Array(content), res);
    return res;
}

function prepareExecutionContext() {
    Module.memLog = '';
    Module.memErrLog = '';

    // // restore heap memory
    // if (Module.initMem) {
    //     wasmMemory.buffer = new Uint8Array(Module.initMem.byteLength);
    //     wasmMemory.buffer.set(Module.initmem);
    // }

    FS.streams.forEach((stream) => {
        if (!stream || stream.fd <= 2) {
            return
        }
        FS.close(stream);
    })
    FS.chdir(Module.workRoot);
}

/**
 *
 * @param {number} engineType
 * @param {string} target
 * @return {{err?: Error, log: string, errLog: string, data?: Uint8Array}}
 */
function makeLatex(engineType, target) {
    prepareExecutionContext();

    const setMainFunction = cwrap('setMainEntry', 'number', ['string']);
    setMainFunction(Module.mainFile)


    let compile = _compileLaTeX;
    if (engineType === engine.DVIPDF) {
        compile = _compilePDF
    }

    let status = compile();
    if (status !== 0) {
        const err = Error("Compilation failed, with status code " + status);
        return {err, log: Module.memLog, errLog: Module.memErrLog}
    }

    try {
        _compileBibtex();
    } catch (err) {
        console.error("Ignoring bibtex exceptions", err)
    }

    let data;
    let pdfurl = Module.workRoot + target;
    try {
        data = FS.readFile(pdfurl, {encoding: 'binary'});
    } catch (err) {
        err = err + "\nFetch content failed. " + pdfurl;
        console.error(err);
        return {err, log: Module.memLog, errLog: Module.memErrLog}
    }

    return {data, log: Module.memLog, errLog: Module.memErrLog}
}


/**
 *
 * @param {string} fileName
 * @return {{err?: Error, log: string, errLog: string, data?: Uint8Array}}
 */
function makeFormat(fileName) {
    prepareExecutionContext();

    let status = _compileFormat();
    if (status !== 0) {
        const err = Error("Compilation failed, with status code " + status);
        console.error(err)
        return {err, log: Module.memLog, errLog: Module.memErrLog}
    }

    let data;
    let pdfurl = Module.workRoot + fileName;
    try {
        data = FS.readFile(pdfurl, {encoding: 'binary'});
    } catch (err) {
        err = Error(err + "\nFetch content failed. " + pdfurl);
        console.error(err);
        return {err, log: Module.memLog, errLog: Module.memErrLog}
    }

    return {data, log: Module.memLog, errLog: Module.memErrLog}
}


Module.onRuntimeInitialized = function () {
    Module.cacheRoot = "/tex";
    Module.workRoot = "/work";
    Module.memLog = "";
    Module.memErrLog = "";
    Module.initMem = undefined;
    Module.mainFile = "";
    Module.texliveURL = "https://texlive2.swiftlatex.com/";

    Module.print = function (a) {
        Module.memLog += (a + "\n");
        console.log(a)
    };
    Module.printErr = function (a) {
        Module.memErrLog += (a + "\n");
        console.error(a);
    };
    Module.preRun.push(function () {
        FS.mkdir(Module.cacheRoot);
        FS.mkdir(Module.workRoot);
    });

    // Module.postRun = function () {
    //     const src = wasmMemory.buffer;
    //     Module.initMem = new Uint8Array(src.byteLength);
    //     Module.initMem.set(new Uint8Array(src));
    // };

    Module.onAbort = function () {
        Module.memErrLog += 'Engine crashed\n';
    };


    // Module.locateFile = function (path, scriptDirectory) {
    //     // The __WASM_BINARY__ variable does not exist.
    //     // Rollup will substitute it with the appropriate binary name.
    //     // const _wasmURL = require(__SWIFTLATEX_WASM_BINARY__);
    //     const _wasmURL = require("./swiftlatexpdftex.wasm");
    //     if (path === wasmBinaryFile) {
    //         return new URL(_wasmURL, import.meta.url).href
    //     }
    //     return scriptDirectory + path
    // }

    Module.writeFile = function (filePath, content) {
        try {
            if (!filePath.startsWith("/")) filePath = "/" + filePath
            FS.writeFile(Module.workRoot + filePath, content)
        } catch (err) {
            return {err}
        }
        return {}
    }

    Module.setMainFile = function (/** @type {string} */ filePath) {
        if (!filePath.startsWith("/")) filePath = "/" + filePath
        filePath = Module.workRoot + filePath
        // @ts-expect-error
        let detail = FS.analyzePath(filePath, false)
        if (detail.exists && FS.isFile(FS.stat(filePath).mode)) {
            Module.mainFile = filePath
        } else {
            let msg = "Path must be an existing file."
            if (detail.error && detail.error.message) msg += " " + detail.error.message
            return {err: Error(msg)}
        }
        return {}
    }

    Module.flushCache = function () {
        try {
            FS.unlink(Module.workRoot);
            FS.mkdir(Module.workRoot);
        } catch (err) {
            return {err}
        }
        return {}
    }

    Module.mkdir = function (/** @type {string} */ dirname) {
        try {
            FS.mkdir(Module.workRoot + "/" + dirname)
        } catch (err) {
            return {err}
        }
        return {}
    }

    Module.setTexliveURL = function (/** @type {string} */ url) {
        if (typeof url !== "string") {
            return {err: Error("Texlive URL must be a string value")}
        }
        if (!url.endsWith("/")) url += "/";
        Module.texliveURL = url
        return {url}
    }

    Module.compileXetex = function () {
        const target = "/" + Module.mainFile.substring(0, Module.mainFile.length - 4) + ".xdv";
        return makeLatex(engine.XETEX, target)
    }

    Module.compileXetexFormat = function () {
        return makeFormat("/xelatex.fmt")
    }

    Module.compileDviPDF = function () {
        const target = "/" + Module.mainFile.substring(0, Module.mainFile.length - 4) + ".pdf";
        return makeLatex(engine.DVIPDF, target)
    }

    Module.compilePDFTex = function () {
        const target = "/" + Module.mainFile.substring(0, Module.mainFile.length - 4) + ".pdf";
        return makeLatex(engine.PDFTEX, target)
    }
    Module.compilePDFTexFormat = function () {
        return makeFormat("/pdflatex.fmt")
    }
}

if (ENVIRONMENT_IS_WORKER) {
    self.onmessage = function (ev) {
        let data = ev.data;
        const cmd = data.cmd;

        switch (cmd) {
            case "compileXetex":
                self.postMessage({...Module.compileXetex(), cmd});
                break;
            case "compileXetexFormat":
                self.postMessage({...Module.compileXetexFormat(), cmd});
                break;
            case "compileDviPDF":
                self.postMessage({...Module.compileDviPDF(), cmd});
                break;
            case "compilePDFTex":
                self.postMessage({...Module.compilePDFTex(), cmd});
                break;
            case "setTexliveURL":
                self.postMessage({...Module.setTexliveURL(data.url), cmd})
                break
            case "fsMkdir":
                self.postMessage({...Module.mkdir(data.dirname), cmd});
                break;
            case "fsWrite":
                self.postMessage({...Module.writeFile(data.filePath, data.content), cmd});
                break;
            case "setMainFile":
                self.postMessage({...Module.setMainFile(data.filePath), cmd})
                break;
            case "flushCache":
                self.postMessage({...Module.flushCache(), cmd})
                break;
            default:
                self.postMessage({
                    err: Error("Unknown command: " + cmd),
                    cmd
                })
        }
    };
}


let texlive404Cache = /** @type {{[key: string]: number}} */ {};
let texlive200Cache = /** @type {{[key: string]: string}} */ {};

/**
 * @param {number} nameptr - A pointer to a null-terminated UTF8-encoded string in the Emscripten HEAP.
 * @param {number} format - An integer from an enum representing to representing the file format
 * @param {number | boolean} _mustexist
 */
function kpse_find_file_impl(nameptr, format, _mustexist) {

    let reqname = UTF8ToString(nameptr);

    // It is a hack , since webassembly version latex engine stores
    // all templates file inside /tex/, therefore, we have to fetch it again
    if (reqname.startsWith("/tex/")) {
        reqname = reqname.substring(5);
    }

    if (reqname.includes("/")) {
        return 0;
    }

    const cacheKey = format + "/" + reqname;

    if (cacheKey in texlive404Cache) {
        return 0;
    }

    if (cacheKey in texlive200Cache) {
        const savepath = texlive200Cache[cacheKey];
        return _allocate(intArrayFromString(savepath));
    }


    const remoteURL = Module.texliveURL + 'xetex/' + cacheKey;
    let xhr = new XMLHttpRequest();
    xhr.open("GET", remoteURL, false);
    xhr.timeout = 150000;
    xhr.responseType = "arraybuffer";
    console.log("Start downloading texlive file " + remoteURL);
    try {
        xhr.send();
    } catch (err) {
        console.log("TexLive Download Failed " + remoteURL);
        return 0;
    }

    if (xhr.status === 200) {
        let arraybuffer = xhr.response;
        const fileid = xhr.getResponseHeader('fileid');
        const savepath = Module.cacheRoot + "/" + fileid;
        FS.writeFile(savepath, new Uint8Array(arraybuffer));
        texlive200Cache[cacheKey] = savepath;
        return _allocate(intArrayFromString(savepath));

    } else if (xhr.status === 301) {
        console.log("TexLive File not exists " + remoteURL);
        texlive404Cache[cacheKey] = 1;
        return 0;
    }
    return 0;
}

let font200Cache = /** @type {{[key: string]: number}} */ {};
let font404Cache = /** @type {{[key: string]: string}} */ {};

/**
 * @param {number} fontnamePtr
 * @param {number} varStringPtr
 */
function fontconfig_search_font_impl(fontnamePtr, varStringPtr) {
    const fontname = UTF8ToString(fontnamePtr);
    let variant = UTF8ToString(varStringPtr);
    if (!variant) {
        variant = 'OT';
    }
    variant = variant.replace(/\//g, '_');

    const cacheKey = variant + '/' + fontname;

    if (cacheKey in font200Cache) {
        const savepath = font200Cache[cacheKey];
        return _allocate(intArrayFromString(savepath));
    }

    if (cacheKey in font404Cache) {
        return 0;
    }

    const remoteURL = Module.texliveURL + 'fontconfig/' + cacheKey;
    let xhr = new XMLHttpRequest();
    xhr.open("GET", remoteURL, false);
    xhr.timeout = 150000;
    xhr.responseType = "arraybuffer";
    console.log("Start downloading font file " + remoteURL);
    try {
        xhr.send();
    } catch (err) {
        console.log("Font Download Failed " + remoteURL);
        return 0;
    }
    if (xhr.status === 200) {
        let arraybuffer = xhr.response;
        const fontID = xhr.getResponseHeader('fontid');
        const savepath = Module.cacheRoot + "/" + fontID;

        FS.writeFile(savepath, new Uint8Array(arraybuffer));
        font200Cache[cacheKey] = savepath;
        return _allocate(intArrayFromString(savepath));

    } else if (xhr.status === 301 || xhr.status === 404) {
        console.log("Font File not exists " + remoteURL);
        font404Cache[cacheKey] = 1;
        return 0;
    }

    return 0;
}


let pk404_cache = /** @type {{[key: string]: number}} */ {};
let pk200_cache = /** @type {{[key: string]: string}} */ {};


/**
 * @param {number} nameptr
 * @param {number} dpi
 */
function kpse_find_pk_impl(nameptr, dpi) {
    const reqname = UTF8ToString(nameptr);

    if (reqname.includes("/")) {
        return 0;
    }

    const cacheKey = dpi + "/" + reqname;

    if (cacheKey in pk404_cache) {
        return 0;
    }

    if (cacheKey in pk200_cache) {
        const savepath = pk200_cache[cacheKey];
        return _allocate(intArrayFromString(savepath));
    }

    const remote_url = Module.texliveURL + 'pdftex/pk/' + cacheKey;
    let xhr = new XMLHttpRequest();
    xhr.open("GET", remote_url, false);
    xhr.timeout = 150000;
    xhr.responseType = "arraybuffer";
    console.log("Start downloading texlive file " + remote_url);
    try {
        xhr.send();
    } catch (err) {
        console.log("TexLive Download Failed " + remote_url);
        return 0;
    }

    if (xhr.status === 200) {
        let arraybuffer = xhr.response;
        const pkid = xhr.getResponseHeader('pkid');
        const savepath = Module.cacheRoot + "/" + pkid;
        FS.writeFile(savepath, new Uint8Array(arraybuffer));
        pk200_cache[cacheKey] = savepath;
        return _allocate(intArrayFromString(savepath));

    } else if (xhr.status === 301) {
        console.log("TexLive File not exists " + remote_url);
        pk404_cache[cacheKey] = 1;
        return 0;
    }
    return 0;
}
