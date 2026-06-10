const ts = require('typescript');

/**
 * Return leading comments of a node.
 *
 * @param node The node with leading comments to be retrieved.
 * @param source The source code text to extract the comments from.
 * @returns all leading comments.
 */
function getLeadingComments(node, source) {
    return (ts.getLeadingCommentRanges(source, node.pos) ?? []).map((range) => ({
        ...range,
        text: source.slice(
            range.pos + 2,
            range.kind === ts.SyntaxKind.MultiLineCommentTrivia ? range.end - 2 : range.end,
        ),
        pos: -1,
        end: -1,
    }));
}

/**
 * Parse source string as virtual TypeScript source file.
 */
function createSource(name, source) {
    return ts.createSourceFile(name, source, ts.ScriptTarget.ESNext, false, ts.ScriptKind.TS);
}

module.exports = {
    getLeadingComments,
    createSource,
};
