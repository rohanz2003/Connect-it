// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// React Router 7 uses Web Encoding APIs that CRA's older jsdom does not expose.
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
