import esbuild, {minify} from 'rollup-plugin-esbuild';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy'

export default [
    {
        input: './main.ts',
        output: [
            {
                file: 'dist/swiftlatex.js',
                format: 'umd',
                name: "SwiftLatex",
            },
            {
                file: 'dist/swiftlatex.min.js',
                format: 'umd',
                plugins: [minify()],
                name: "SwiftLatex",
            }
        ],
        plugins: [
            nodeResolve(),
            esbuild(
                // {
                //     loaders: {'.wasm': 'file'}
                // }
            ),
            copy({
                targets: [
                    {
                        src: [
                            './xetex.wasm/swiftlatexxetex.wasm',
                            './pdftex.wasm/swiftlatexpdftex.wasm',
                            './dvipdfm.wasm/swiftlatexdvipdfm.wasm',
                        ],
                        dest: 'dist/'
                    }
                ]
            })
        ]
    }
];
