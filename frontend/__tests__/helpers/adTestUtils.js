/**
 * Shared helpers for the NativeAdCard render tests.
 *
 * Deliberately CommonJS + no top-level React import so that test files can
 * control process.env BEFORE requiring the component under test (its flags are
 * read at module scope).
 */
const { StyleSheet } = require('react-native');

const WINDOW_WIDTH = 390;
const CARD_HEIGHT = 700;

/** Walk a react-test-renderer JSON tree, collecting every node. */
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n) => walk(n, visit));
    return;
  }
  visit(node);
  (node.children || []).forEach((c) => walk(c, visit));
}

function collectByType(tree, type) {
  const out = [];
  walk(tree, (n) => {
    if (n.type === type) out.push(n);
  });
  return out;
}

/** Immediate string children of a node, concatenated. */
function directText(node) {
  return (node.children || []).filter((c) => typeof c === 'string').join('');
}

function hasElementChildren(node) {
  return (node.children || []).some((c) => c && typeof c === 'object');
}

/**
 * Every Text node that renders nothing: no element children AND no
 * non-whitespace string content. This is exactly the bug the layout commit
 * fixed (self-closing <Text /> under <NativeAsset>).
 */
function emptyTextNodes(tree) {
  return collectByType(tree, 'Text').filter(
    (n) => !hasElementChildren(n) && directText(n).trim() === '',
  );
}

/** All rendered text, for presence assertions. */
function allTexts(tree) {
  return collectByType(tree, 'Text').map(directText);
}

function flatten(style) {
  return StyleSheet.flatten(style) || {};
}

/** The single Text styled as the CTA pill (the only one carrying minWidth). */
function findCtaNode(tree) {
  return collectByType(tree, 'Text').find(
    (n) => flatten(n.props.style).minWidth !== undefined,
  );
}

/** Any host node whose flattened style has the given numeric height. */
function nodesWithHeight(tree, height) {
  const out = [];
  walk(tree, (n) => {
    if (n.props && flatten(n.props.style).height === height) out.push(n);
  });
  return out;
}

module.exports = {
  WINDOW_WIDTH,
  CARD_HEIGHT,
  walk,
  collectByType,
  directText,
  hasElementChildren,
  emptyTextNodes,
  allTexts,
  flatten,
  findCtaNode,
  nodesWithHeight,
};
