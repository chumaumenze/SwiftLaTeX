import dts from "rollup-plugin-dts";
import copy from "rollup-plugin-copy";
import typescript from "@rollup/plugin-typescript";
import esbuild, { minify } from "rollup-plugin-esbuild";
import { nodeResolve } from "@rollup/plugin-node-resolve";

import packageJson from "./package.json" assert { type: "json" };

const pkgName = packageJson.name.replace(/\.js$/, "");

export default [
  {
    input: "./main.ts",
    output: [
      {
        file: `dist/${pkgName}.js`,
        format: "es",
        name: pkgName,
        sourcemap: false,
      },
      {
        file: `dist/${pkgName}.min.js`,
        format: "es",
        plugins: [minify()],
        name: pkgName,
        sourcemap: false,
      },
    ],
    plugins: [
      nodeResolve(),
      esbuild({
        loaders: { ".wasm": "binary" },
      }),
      typescript({
        // noEmitOnError: true,
        // declaration: true,
        // declarationDir: "./dist",
        sourceMap: false,
      }),
      copy({
        targets: [
          {
            src: [
              "./xetex.wasm/swiftlatexxetex.wasm",
              "./pdftex.wasm/swiftlatexpdftex.wasm",
              "./dvipdfm.wasm/swiftlatexdvipdfm.wasm",
            ],
            dest: "dist/",
          },
        ],
      }),
    ],
  },
  // {
  //   input: "./main.ts",
  //   output: {
  //     file: `dist/${pkgName}.d.ts`,
  //     format: "es",
  //     exports: "named",
  //   },
  //   plugins: [dts()],
  // },
];
