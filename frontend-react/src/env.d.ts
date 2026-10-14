/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module 'monaco-editor/languages/definitions/python/python.js' {
  export const conf: import('monaco-editor').languages.LanguageConfiguration
  export const language: import('monaco-editor').languages.IMonarchLanguage
}
