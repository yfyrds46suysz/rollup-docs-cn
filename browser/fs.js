const nope = method => `Cannot use fs.${method} inside browser`;

export const readdirSync = nope( 'readdirSync' );
export const readFileSync = nope( 'readFileSync' );
export const writeFile = nope( 'writeFile' );
