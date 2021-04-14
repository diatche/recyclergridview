import typescript from '@rollup/plugin-typescript';
import alias from '@rollup/plugin-alias';
// import jsx from 'acorn-jsx';
// import { nodeResolve } from '@rollup/plugin-node-resolve';
import pkg from './package.json';
import copy from 'rollup-plugin-copy';
import Path from 'path';

const outputDefaults = {
    globals: {
        react: 'React',
        'react-native': 'ReactNative',
    },
};

const rnOutputDefaults = {
    ...outputDefaults,
    globals: {
        ...outputDefaults.globals,
        // 'react-native': 'ReactNative',
    },
};

const rOutputDefaults = {
    ...outputDefaults,
    globals: {
        ...outputDefaults.globals,
        // 'react-native-web': 'React',
        // 'react-native': 'React',
    },
};

let baseConfig = {
    input: 'src/index.ts',
    external: [
        'react-native-web',
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
        ...Object.keys(pkg.optionalDependencies || {}),
    ],
    // acornInjectPlugins: [jsx()],
    // plugins: [nodeResolve()],
    plugins: [],
};

let rnConfig = {
    ...baseConfig,
    output: [
        // {
        //     ...rnOutputDefaults,
        //     file: pkg.main,
        //     // dir: 'dist/reactnative',
        //     format: 'cjs',
        //     sourcemap: true,
        // },
        {
            ...rnOutputDefaults,
            // name: 'Evergrid',
            // file: pkg.module,
            dir: 'dist/reactnative',
            // format: 'umd',
            format: 'es',
            sourcemap: true,
        },
    ],
    // acornInjectPlugins: [jsx()],
    plugins: [
        ...baseConfig.plugins,
        typescript({
            outDir: 'dist/reactnative',
            // jsx: 'react-native',
            jsx: 'react',
            types: ['react', 'react-native'],
            // typescript: require('typescript'),
            // useTsconfigDeclarationDir: true,
            // tsconfigOverride: {
            //     compilerOptions: {
            //         module: 'ESNext',
            //     }
            // }
        }),
    ],
};

let rConfig = {
    ...baseConfig,
    output: [
        {
            ...rOutputDefaults,
            name: 'Evergrid',
            // file: pkg.browser,
            dir: 'dist/web',
            format: 'es',
            // format: 'umd',
            sourcemap: true,
            // plugins: [getBabelOutputPlugin({ presets: ['@babel/preset-env'] })]
        },
    ],
    plugins: [
        ...baseConfig.plugins,
        // babel({
        //     presets: ['@babel/preset-react'],
        //     exclude: ['node_modules/**'],
        // }),
        typescript({
            outDir: 'dist/web',
            jsx: 'react',
            types: ['react'],
            // typescript: require('typescript'),
            // useTsconfigDeclarationDir: true,
            // tsconfigOverride: {
            //     compilerOptions: {
            //         module: 'ESNext',
            //     }
            // }
        }),
        alias({
            // 'react-native': 'react-native-web',
            entries: [
                { find: /^react-native$/, replacement: 'react-native-web' },
            ],
        }),
    ],
};

let tasks = [
    rnConfig,
    // rConfig,
];

export default args => {
    if (args.copy) {
        console.debug('Copying output to: ' + args.copy);
        return tasks.map(task => ({
            ...task,
            plugins: [
                ...task.plugins,
                copy({
                    targets: task.output.map(output => ({
                        src: output.dir,
                        dest: args.copy,
                    })),
                    hook: 'writeBundle', // Copy after writing to disk
                    verbose: true,
                }),
            ],
        }));
    }
    return tasks;
};
