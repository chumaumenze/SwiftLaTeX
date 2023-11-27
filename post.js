function print(a) {
    Module.memlog += (a + "\n");
    console.log(a)
}

function printErr(a) {
    Module.memErrlog += (a + "\n");
    console.error(a);
}

function _allocate(content) {
    let res = _malloc(content.length);
    HEAPU8.set(new Uint8Array(content), res);
    return res;
}

function dumpHeapMemory() {
    var src = wasmMemory.buffer;
    var dst = new Uint8Array(src.byteLength);
    dst.set(new Uint8Array(src));
    // console.log("Dumping " + src.byteLength);
    return dst;
}

function restoreHeapMemory() {
    if (Module.initMem) {
        var dst = new Uint8Array(wasmMemory.buffer);
        dst.set(Module.initmem);
    }
}

function closeFSStreams() {
    for (var i = 0; i < FS.streams.length; i++) {
        var stream = FS.streams[i];
        if (!stream || stream.fd <= 2) {
            continue;
        }
        FS.close(stream);
    }
}

function prepareExecutionContext() {
    Module.memLog = '';
    Module.memErrLog = '';
    restoreHeapMemory();
    closeFSStreams();
    FS.chdir(Module.workRoot);
}


Module['onRuntimeInitialized'] = function () {
    Module.cacheRoot = "/tex";
    Module.workRoot = "/work";
    Module.memLog = "";
    Module.memErrLog = "";
    Module.initMem = undefined;
    Module.mainFile = "";
    Module.texliveURL = "https://texlive2.swiftlatex.com/";

    Module.print = print;
    Module.printErr = printErr;
    Module.preRun = function () {
        FS.mkdir(Module.cacheRoot);
        FS.mkdir(Module.workRoot);
    };
    Module.postRun = function () {
        Module.initMem = dumpHeapMemory();
    };
    Module.onAbort = function () {
        Module.memErrlog += 'Engine crashed\n';
    };

    Module.writeFile = function (filename, content) {
        filename = Module.workRoot + "/" + filename
        FS.writeFile(filename, content)
    }

    Module.flushCache = function () {
        FS.unlink(Module.workRoot);
        FS.mkdir(Module.workRoot);
    }

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
            err = err + "\nFetch content failed. " + pdfurl;
            console.error(err);
            return {err, log: Module.memLog, errLog: Module.memErrLog}
        }

        return {data, log: Module.memLog, errLog: Module.memErrLog}
    }

    function makeLatex(target) {
        prepareExecutionContext();

        const setMainFunction = cwrap('setMainEntry', 'number', ['string']);
        setMainFunction(Module.mainfile)

        let status = _compileLaTeX();
        if (status !== 0) {
            const err = Error("Compilation failed, with status code " + status);
            console.error(err)
            return {err, log: Module.memLog, errLog: Module.memErrLog}
        }

        _compileBibtex();

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

    Module.compileXetex = function () {
        const target = "/" + Module.mainfile.substring(0, Module.mainfile.length - 4) + ".xdv";
        return makeLatex(target)
    }

    Module.compileXetexFormat = function () {
        return makeFormat("/xelatex.fmt")
    }

    Module.compileDviPDF = function () {
        prepareExecutionContext();

        const setMainFunction = cwrap('setMainEntry', 'number', ['string']);
        setMainFunction(Module.mainfile)

        let status = _compilePDF();
        if (status !== 0) {
            const err = Error("Compilation failed, with status code " + status);
            console.error(err)
            return {err, log: Module.memLog, errLog: Module.memErrLog}
        }

        let data;
        let pdfurl = Module.workRoot + "/" + Module.mainfile.substring(0, Module.mainfile.length - 4) + ".pdf";
        try {
            data = FS.readFile(pdfurl, {encoding: 'binary'});
        } catch (err) {
            err = err + "\nFetch content failed. " + pdfurl;
            console.error(err);
            return {err, log: Module.memLog, errLog: Module.memErrLog}
        }

        return {data, log: Module.memLog, errLog: Module.memErrLog}
    }

    Module.compilePDFTex = function () {
        const target = "/" + self.mainfile.substring(0, self.mainfile.length - 4) + ".pdf";
        return makeLatex(target)
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
                if (typeof data.url !== "string") {
                    self.postMessage({
                        err: Error("Texlive URL must be a string value"),
                        cmd
                    })
                    break;
                }
                if (!data.endsWith("/")) data.url += "/";
                Module.texliveURL = data.url
                self.postMessage({url: data.url, cmd})
                break
            case "fsMkdir":
                let dirname = data.url;
                try {
                    FS.mkdir(Module.workRoot + "/" + dirname)
                    self.postMessage({cmd});
                } catch (err) {
                    self.postMessage({err, cmd});
                }
                break;
            case "fsWrite":
                let filePath = data.url, contents = data.src;
                if (!filePath.startsWith("/")) filePath = "/" + filePath
                try {
                    FS.writeFile(Module.workRoot + filePath, contents)
                    self.postMessage({cmd});
                } catch (err) {
                    self.postMessage({err, cmd});
                }
                break;
            case "setMainFile":
                let name = data.url;
                if (!name.startsWith("/")) name = "/" + name
                name = Module.workRoot + name
                let detail = FS.analyzePath(name, false)
                if (detail.exists && FS.isFile(FS.stat(name).mode)) {
                    Module.mainFile = name
                    self.postMessage({cmd})
                } else {
                    let msg = "Path must be an existing file."
                    if (detail.error && detail.error.message) msg += " " + detail.error.message
                    self.postMessage({
                        err: Error(msg),
                        cmd
                    })
                }
                break;
            case "flushCache":
                try {
                    Module.flushCache()
                    self.postMessage({cmd})
                } catch (err) {
                    self.postMessage({err, cmd})
                }
                break;
            default:
                self.postMessage({
                    err: Error("Unknown command: " + cmd),
                    cmd
                })
        }
    };
}


let texlive404Cache = {};
let texlive200Cache = {};

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

let font200Cache = {};
let font404Cache = {};

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

let pk404_cache = {};
let pk200_cache = {};

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
