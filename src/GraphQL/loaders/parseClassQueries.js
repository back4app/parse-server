import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsQueries from './objectsQueries';
import * as parseClassTypes from './parseClassTypes';

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const {
    classGraphQLOutputType,
    classGraphQLFindArgs,
    classGraphQLFindResultType,
  } = parseGraphQLSchema.parseClassTypes[className];

  const getGraphQLQueryName = `get${className}`;
  parseGraphQLSchema.graphQLObjectsQueries[getGraphQLQueryName] = {
    description: `The ${getGraphQLQueryName} query can be used to get an object of the ${className} class by its id.`,
    args: {
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
      readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
      includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT,
    },
    type: new GraphQLNonNull(classGraphQLOutputType),
    async resolve(_source, args, context, queryInfo) {
      try {
        const { objectId, readPreference, includeReadPreference } = args;
        const { config, auth, info } = context;
        const selectedFields = getFieldNames(queryInfo);

        const { keys, include } = parseClassTypes.extractKeysAndInclude(
          selectedFields
        );

        return await objectsQueries.getObject(
          className,
          objectId,
          keys,
          include,
          readPreference,
          includeReadPreference,
          config,
          auth,
          info
        );
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  const findGraphQLQueryName = `find${className}`;
  parseGraphQLSchema.graphQLObjectsQueries[findGraphQLQueryName] = {
    description: `The ${findGraphQLQueryName} query can be used to find objects of the ${className} class.`,
    args: classGraphQLFindArgs,
    type: new GraphQLNonNull(classGraphQLFindResultType),
    async resolve(_source, args, context, queryInfo) {
      try {
        const {
          order,
          skip,
          limit,
          readPreference,
          includeReadPreference,
          subqueryReadPreference,
        } = args;
        let { where } = args;
        const { config, auth, info } = context;
        const selectedFields = getFieldNames(queryInfo);

        const { keys, include } = parseClassTypes.extractKeysAndInclude(
          selectedFields
            .filter(field => field.includes('.'))
            .map(field => field.slice(field.indexOf('.') + 1))
        );
        const parseOrder = order && order.join(',');

        if (where) {
          let newConstraints = {};
          Object.keys(where).forEach(field => {
            if (
              parseClass.fields[field] &&
              parseClass.fields[field].type === 'Object'
            ) {
              const objectConstraints = where[field].reduce(
                (acc, objectConstraint) => {
                  const { key } = objectConstraint;
                  const constraints = Object.entries(objectConstraint).filter(
                    field => field[0] !== 'key'
                  );
                  if (constraints.length === 0) {
                    throw new Error(`No constraints found for field ${field}`);
                  }
                  const constraint = constraints[0];
                  return {
                    ...acc,
                    [`${field}.${key}`]: { [constraint[0]]: constraint[1] },
                  };
                },
                {}
              );
              newConstraints = {
                ...newConstraints,
                ...objectConstraints,
              };
              delete where[field];
            }
          });
          where = {
            ...where,
            ...newConstraints,
          };
        }

        return await objectsQueries.findObjects(
          className,
          where,
          parseOrder,
          skip,
          limit,
          keys,
          include,
          false,
          readPreference,
          includeReadPreference,
          subqueryReadPreference,
          config,
          auth,
          info,
          selectedFields.map(field => field.split('.', 1)[0])
        );
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };
};

export { load };
