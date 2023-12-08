///<reference types="emscripten"/>

var ENVIRONMENT_IS_WORKER: boolean;

type CaughtError = Error | unknown
type CompileResult = {err?: Error, log: string, errLog: string, data?: Uint8Array}

declare var Module: EmscriptenModule & {
    memLog: string;
    memErrLog: string;
    cacheRoot: string;
    workRoot: string;
    initMem?: ArrayBuffer | SharedArrayBuffer;
    mainFile: string;
    texliveURL: string;
    writeFile: (filePath: string, content: string | ArrayBufferView) => { err?: CaughtError };
    setMainFile: (filePath: string) => {err?: Error};
    flushCache: () => { err?: CaughtError };
    mkdir: (dirname: string) => { err?: CaughtError };
    setTexliveURL: (url: string) => {err?: Error, url?: string};
    compileXetex: () => {err?: CaughtError, data?: any, log: string, errLog: string}
    compileXetexFormat: () => CompileResult
    compileDviPDF: () => CompileResult & {err?: CaughtError}
    compilePDFTex: () => CompileResult & {err?: CaughtError}
    compilePDFTexFormat: () => CompileResult
}
