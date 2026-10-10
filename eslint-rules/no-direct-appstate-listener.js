'use strict';

/**
 * Disallows direct AppState.addEventListener / AppState.removeEventListener
 * calls. All AppState listeners must go through registerAppStateHandler from
 * lib/appStateCoordinator so the three-phase microtask drain gate is applied
 * uniformly and the native bridge is never flooded during background transitions.
 */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow direct AppState.addEventListener — use registerAppStateHandler from lib/appStateCoordinator instead.',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noDirectAppStateListener:
        'Direct AppState.{{ method }}() is forbidden. ' +
        "Use registerAppStateHandler() from '@/lib/appStateCoordinator' instead. " +
        'This ensures all state transitions pass through the three-phase microtask drain gate.',
    },
    schema: [],
  },

  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'AppState' &&
          node.property.type === 'Identifier' &&
          (node.property.name === 'addEventListener' ||
            node.property.name === 'removeEventListener')
        ) {
          // Allow the one place that must exist: the coordinator root wiring
          // in app/_layout.tsx (the single legitimate call site that feeds
          // the coordinator itself).
          const filename = context.getFilename();
          if (filename.includes('app/_layout') || filename.includes('app\\_layout')) {
            return;
          }
          context.report({
            node,
            messageId: 'noDirectAppStateListener',
            data: { method: node.property.name },
          });
        }
      },
    };
  },
};
