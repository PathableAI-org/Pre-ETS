/**
 * Effect conventions. The root eslint.config.js spreads `effectConventions` and merges `effectRestrictedSyntax` into
 * its single `no-restricted-syntax` entry, so every workspace inherits them. The selectors only match Effect class
 * factories and error shapes, so non-Effect code is unaffected.
 * See docs/engineering/effect-guidance.md#errors-and-identifiers for the rationale.
 */

/**
 * Classes whose factory's first argument is a runtime identifier: `_tag` for errors, the key for services.
 * Matches `class X extends Schema.TaggedError<X>()("X", fields)` and `class X extends Context.Service<X, S>()("X")`.
 */
const identifiedClass = [
  "[id]",
  "[superClass.callee.callee.object.name=/^(Schema|Context)$/]",
  "[superClass.callee.callee.property.name=/^(TaggedError|TaggedClass|Service)$/]"
].join("")

const identifierMatchesClass = {
  create(context) {
    const check = (node) => {
      const [identifier] = node.superClass.arguments
      if (identifier?.value === node.id.name) return
      const callee = node.superClass.callee.callee
      context.report({
        data: { className: node.id.name, factory: `${callee.object.name}.${callee.property.name}` },
        messageId: "mismatch",
        node: identifier ?? node.superClass
      })
    }
    return { [`ClassDeclaration${identifiedClass}`]: check, [`ClassExpression${identifiedClass}`]: check }
  },
  meta: {
    docs: { description: "Require Effect tags and service keys to be a string literal equal to the class name." },
    messages: {
      mismatch:
        "{{factory}} identifier must be the string literal \"{{className}}\": no package prefix, path, or constant."
    },
    schema: [],
    type: "problem"
  }
}

const schemaInstanceOfError = "CallExpression[callee.object.name='Schema'][callee.property.name='instanceOf']"

const schemaSyncCodec = "CallExpression[callee.object.name='Schema'][callee.property.name=/^(decode|encode)\\w*Sync$/]"

/** `no-restricted-syntax` entries for Effect error shapes; the root config merges them into its single entry. */
export const effectRestrictedSyntax = [
  {
    message: "Discriminate on the `_tag` literal; do not mirror it in a static field.",
    selector: "PropertyDefinition[static=true][key.name='tag']"
  },
  {
    message: "Construct errors with `new X({ ... })`; do not add a static `new` factory.",
    selector: "MethodDefinition[static=true][key.name='new']"
  },
  {
    message:
      "Inside Effect code, use `Schema.decodeUnknownEffect`/`encodeEffect` so failures stay typed; a sync codec throws. Build a throwing validator outside the generator only for non-Effect callers.",
    selector: [
      `:function[generator=true] ${schemaSyncCodec}`,
      `CallExpression[callee.object.name='Effect'][callee.property.name=/^try(Promise)?$/] ${schemaSyncCodec}`
    ].join(", ")
  },
  {
    message: "Use `Schema.Defect()` for an error cause.",
    selector:
      `${schemaInstanceOfError}[arguments.0.name='Error'], ${schemaInstanceOfError}[arguments.0.property.name='Error']`
  }
]

export const effectConventions = [
  {
    files: ["**/*.ts"],
    plugins: {
      "pathable-effect": { rules: { "identifier-matches-class": identifierMatchesClass } }
    },
    rules: {
      "pathable-effect/identifier-matches-class": "error"
    }
  }
]
