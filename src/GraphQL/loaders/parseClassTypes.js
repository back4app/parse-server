import {
  GraphQLID,
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLEnumType,
} from 'graphql';
import {
  globalIdField,
  connectionArgs,
  connectionDefinitions,
} from 'graphql-relay';
import getFieldNames from 'graphql-list-fields';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsQueries from '../helpers/objectsQueries';
import { ParseGraphQLClassConfig } from '../../Controllers/ParseGraphQLController';
import { transformClassNameToGraphQL } from '../transformers/className';
import { transformInputTypeToGraphQL } from '../transformers/inputType';
import { transformOutputTypeToGraphQL } from '../transformers/outputType';
import { transformConstraintTypeToGraphQL } from '../transformers/constraintType';
import {
  extractKeysAndInclude,
  getParseClassMutationConfig,
} from '../parseGraphQLUtils';

const getParseClassTypeConfig = function(
  parseClassConfig: ?ParseGraphQLClassConfig
) {
  return (parseClassConfig && parseClassConfig.type) || {};
};

const getInputFieldsAndConstraints = function(
  parseClass,
  parseClassConfig: ?ParseGraphQLClassConfig
) {
  const classFields = Object.keys(parseClass.fields).concat('id');
  const {
    inputFields: allowedInputFields,
    outputFields: allowedOutputFields,
    constraintFields: allowedConstraintFields,
    sortFields: allowedSortFields,
  } = getParseClassTypeConfig(parseClassConfig);

  let classOutputFields;
  let classCreateFields;
  let classUpdateFields;
  let classConstraintFields;
  let classSortFields;

  // All allowed customs fields
  const classCustomFields = classFields.filter(field => {
    return (
      !Object.keys(defaultGraphQLTypes.PARSE_OBJECT_FIELDS).includes(field) &&
      field !== 'id'
    );
  });

  if (allowedInputFields && allowedInputFields.create) {
    classCreateFields = classCustomFields.filter(field => {
      return allowedInputFields.create.includes(field);
    });
  } else {
    classCreateFields = classCustomFields;
  }
  if (allowedInputFields && allowedInputFields.update) {
    classUpdateFields = classCustomFields.filter(field => {
      return allowedInputFields.update.includes(field);
    });
  } else {
    classUpdateFields = classCustomFields;
  }

  if (allowedOutputFields) {
    classOutputFields = classCustomFields.filter(field => {
      return allowedOutputFields.includes(field);
    });
  } else {
    classOutputFields = classCustomFields;
  }
  // Filters the "password" field from class _User
  if (parseClass.className === '_User') {
    classOutputFields = classOutputFields.filter(
      outputField => outputField !== 'password'
    );
  }

  if (allowedConstraintFields) {
    classConstraintFields = classCustomFields.filter(field => {
      return allowedConstraintFields.includes(field);
    });
  } else {
    classConstraintFields = classFields;
  }

  if (allowedSortFields) {
    classSortFields = allowedSortFields;
    if (!classSortFields.length) {
      // must have at least 1 order field
      // otherwise the FindArgs Input Type will throw.
      classSortFields.push({
        field: 'id',
        asc: true,
        desc: true,
      });
    }
  } else {
    classSortFields = classFields.map(field => {
      return { field, asc: true, desc: true };
    });
  }

  return {
    classCreateFields,
    classUpdateFields,
    classConstraintFields,
    classOutputFields,
    classSortFields,
  };
};

const load = (
  parseGraphQLSchema,
  parseClass,
  parseClassConfig: ?ParseGraphQLClassConfig
) => {
  const className = parseClass.className;
  const graphQLClassName = transformClassNameToGraphQL(className);
  const {
    classCreateFields,
    classUpdateFields,
    classOutputFields,
    classConstraintFields,
    classSortFields,
  } = getInputFieldsAndConstraints(parseClass, parseClassConfig);

  const {
    create: isCreateEnabled = true,
    update: isUpdateEnabled = true,
  } = getParseClassMutationConfig(parseClassConfig);

  const classGraphQLCreateTypeName = `Create${graphQLClassName}FieldsInput`;
  let classGraphQLCreateType = new GraphQLInputObjectType({
    name: classGraphQLCreateTypeName,
    description: `The ${classGraphQLCreateTypeName} input type is used in operations that involve creation of objects in the ${graphQLClassName} class.`,
    fields: () =>
      classCreateFields.reduce(
        (fields, field) => {
          const type = transformInputTypeToGraphQL(
            parseClass.fields[field].type,
            parseClass.fields[field].targetClass,
            parseGraphQLSchema.parseClassTypes
          );
          if (type) {
            return {
              ...fields,
              [field]: {
                description: `This is the object ${field}.`,
                type:
                  className === '_User' &&
                  (field === 'username' || field === 'password')
                    ? new GraphQLNonNull(type)
                    : type,
              },
            };
          } else {
            return fields;
          }
        },
        {
          ACL: defaultGraphQLTypes.ACL_ATT,
        }
      ),
  });
  classGraphQLCreateType = parseGraphQLSchema.addGraphQLType(
    classGraphQLCreateType
  );

  const classGraphQLUpdateTypeName = `Update${graphQLClassName}FieldsInput`;
  let classGraphQLUpdateType = new GraphQLInputObjectType({
    name: classGraphQLUpdateTypeName,
    description: `The ${classGraphQLUpdateTypeName} input type is used in operations that involve creation of objects in the ${graphQLClassName} class.`,
    fields: () =>
      classUpdateFields.reduce(
        (fields, field) => {
          const type = transformInputTypeToGraphQL(
            parseClass.fields[field].type,
            parseClass.fields[field].targetClass,
            parseGraphQLSchema.parseClassTypes
          );
          if (type) {
            return {
              ...fields,
              [field]: {
                description: `This is the object ${field}.`,
                type,
              },
            };
          } else {
            return fields;
          }
        },
        {
          ACL: defaultGraphQLTypes.ACL_ATT,
        }
      ),
  });
  classGraphQLUpdateType = parseGraphQLSchema.addGraphQLType(
    classGraphQLUpdateType
  );

  const classGraphQLPointerTypeName = `${graphQLClassName}PointerInput`;
  let classGraphQLPointerType = new GraphQLInputObjectType({
    name: classGraphQLPointerTypeName,
    description: `Allow to link OR add and link an object of the ${graphQLClassName} class.`,
    fields: () => {
      const fields = {
        link: {
          description: `Link an existing object from ${graphQLClassName} class. You can use either the global or the object id.`,
          type: GraphQLID,
        },
      };
      if (isCreateEnabled) {
        fields['createAndLink'] = {
          description: `Create and link an object from ${graphQLClassName} class.`,
          type: classGraphQLCreateType,
        };
      }
      return fields;
    },
  });
  classGraphQLPointerType =
    parseGraphQLSchema.addGraphQLType(classGraphQLPointerType) ||
    defaultGraphQLTypes.OBJECT;

  const classGraphQLRelationTypeName = `${graphQLClassName}RelationInput`;
  let classGraphQLRelationType = new GraphQLInputObjectType({
    name: classGraphQLRelationTypeName,
    description: `Allow to add, remove, createAndAdd objects of the ${graphQLClassName} class into a relation field.`,
    fields: () => {
      const fields = {
        add: {
          description: `Add existing objects from the ${graphQLClassName} class into the relation. You can use either the global or the object ids.`,
          type: new GraphQLList(defaultGraphQLTypes.OBJECT_ID),
        },
        remove: {
          description: `Remove existing objects from the ${graphQLClassName} class out of the relation. You can use either the global or the object ids.`,
          type: new GraphQLList(defaultGraphQLTypes.OBJECT_ID),
        },
      };
      if (isCreateEnabled) {
        fields['createAndAdd'] = {
          description: `Create and add objects of the ${graphQLClassName} class into the relation.`,
          type: new GraphQLList(new GraphQLNonNull(classGraphQLCreateType)),
        };
      }
      return fields;
    },
  });
  classGraphQLRelationType =
    parseGraphQLSchema.addGraphQLType(classGraphQLRelationType) ||
    defaultGraphQLTypes.OBJECT;

  const classGraphQLConstraintTypeName = `${graphQLClassName}PointerWhereInput`;
  let classGraphQLConstraintType = new GraphQLInputObjectType({
    name: classGraphQLConstraintTypeName,
    description: `The ${classGraphQLConstraintTypeName} input type is used in operations that involve filtering objects by a pointer field to ${graphQLClassName} class.`,
    fields: {
      equalTo: defaultGraphQLTypes.equalTo(GraphQLID),
      notEqualTo: defaultGraphQLTypes.notEqualTo(GraphQLID),
      in: defaultGraphQLTypes.inOp(defaultGraphQLTypes.OBJECT_ID),
      notIn: defaultGraphQLTypes.notIn(defaultGraphQLTypes.OBJECT_ID),
      exists: defaultGraphQLTypes.exists,
      inQueryKey: defaultGraphQLTypes.inQueryKey,
      notInQueryKey: defaultGraphQLTypes.notInQueryKey,
      inQuery: {
        description:
          'This is the inQuery operator to specify a constraint to select the objects where a field equals to any of the object ids in the result of a different query.',
        type: defaultGraphQLTypes.SUBQUERY_INPUT,
      },
      notInQuery: {
        description:
          'This is the notInQuery operator to specify a constraint to select the objects where a field do not equal to any of the object ids in the result of a different query.',
        type: defaultGraphQLTypes.SUBQUERY_INPUT,
      },
    },
  });
  classGraphQLConstraintType = parseGraphQLSchema.addGraphQLType(
    classGraphQLConstraintType
  );

  const classGraphQLConstraintsTypeName = `${graphQLClassName}WhereInput`;
  let classGraphQLConstraintsType = new GraphQLInputObjectType({
    name: classGraphQLConstraintsTypeName,
    description: `The ${classGraphQLConstraintsTypeName} input type is used in operations that involve filtering objects of ${graphQLClassName} class.`,
    fields: () => ({
      ...classConstraintFields.reduce((fields, field) => {
        if (['OR', 'AND', 'NOR'].includes(field)) {
          parseGraphQLSchema.log.warn(
            `Field ${field} could not be added to the auto schema ${classGraphQLConstraintsTypeName} because it collided with an existing one.`
          );
          return fields;
        }
        const parseField = field === 'id' ? 'objectId' : field;
        const type = transformConstraintTypeToGraphQL(
          parseClass.fields[parseField].type,
          parseClass.fields[parseField].targetClass,
          parseGraphQLSchema.parseClassTypes,
          field
        );
        if (type) {
          return {
            ...fields,
            [field]: {
              description: `This is the object ${field}.`,
              type,
            },
          };
        } else {
          return fields;
        }
      }, {}),
      OR: {
        description: 'This is the OR operator to compound constraints.',
        type: new GraphQLList(new GraphQLNonNull(classGraphQLConstraintsType)),
      },
      AND: {
        description: 'This is the AND operator to compound constraints.',
        type: new GraphQLList(new GraphQLNonNull(classGraphQLConstraintsType)),
      },
      NOR: {
        description: 'This is the NOR operator to compound constraints.',
        type: new GraphQLList(new GraphQLNonNull(classGraphQLConstraintsType)),
      },
    }),
  });
  classGraphQLConstraintsType =
    parseGraphQLSchema.addGraphQLType(classGraphQLConstraintsType) ||
    defaultGraphQLTypes.OBJECT;

  const classGraphQLOrderTypeName = `${graphQLClassName}Order`;
  let classGraphQLOrderType = new GraphQLEnumType({
    name: classGraphQLOrderTypeName,
    description: `The ${classGraphQLOrderTypeName} input type is used when sorting objects of the ${graphQLClassName} class.`,
    values: classSortFields.reduce((sortFields, fieldConfig) => {
      const { field, asc, desc } = fieldConfig;
      const updatedSortFields = {
        ...sortFields,
      };
      const value = field === 'id' ? 'objectId' : field;
      if (asc) {
        updatedSortFields[`${field}_ASC`] = { value };
      }
      if (desc) {
        updatedSortFields[`${field}_DESC`] = { value: `-${value}` };
      }
      return updatedSortFields;
    }, {}),
  });
  classGraphQLOrderType = parseGraphQLSchema.addGraphQLType(
    classGraphQLOrderType
  );

  const classGraphQLFindArgs = {
    where: {
      description:
        'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType,
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: classGraphQLOrderType
        ? new GraphQLList(new GraphQLNonNull(classGraphQLOrderType))
        : GraphQLString,
    },
    skip: defaultGraphQLTypes.SKIP_ATT,
    ...connectionArgs,
    options: defaultGraphQLTypes.READ_OPTIONS_ATT,
  };

  const classGraphQLOutputTypeName = `${graphQLClassName}`;
  const interfaces = [
    defaultGraphQLTypes.PARSE_OBJECT,
    parseGraphQLSchema.relayNodeInterface,
  ];
  const parseObjectFields = {
    id: globalIdField(className, obj => obj.objectId),
    ...defaultGraphQLTypes.PARSE_OBJECT_FIELDS,
  };
  const outputFields = () => {
    return classOutputFields.reduce((fields, field) => {
      const type = transformOutputTypeToGraphQL(
        parseClass.fields[field].type,
        parseClass.fields[field].targetClass,
        parseGraphQLSchema.parseClassTypes
      );
      if (parseClass.fields[field].type === 'Relation') {
        const targetParseClassTypes =
          parseGraphQLSchema.parseClassTypes[
            parseClass.fields[field].targetClass
          ];
        const args = targetParseClassTypes
          ? targetParseClassTypes.classGraphQLFindArgs
          : undefined;
        return {
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            args,
            type,
            async resolve(source, args, context, queryInfo) {
              try {
                const {
                  where,
                  order,
                  skip,
                  first,
                  after,
                  last,
                  before,
                  options,
                } = args;
                const {
                  readPreference,
                  includeReadPreference,
                  subqueryReadPreference,
                } = options || {};
                const { config, auth, info } = context;
                const selectedFields = getFieldNames(queryInfo);

                const { keys, include } = extractKeysAndInclude(
                  selectedFields
                    .filter(field => field.startsWith('edges.node.'))
                    .map(field => field.replace('edges.node.', ''))
                );
                const parseOrder = order && order.join(',');

                return await objectsQueries.findObjects(
                  source[field].className,
                  {
                    $relatedTo: {
                      object: {
                        __type: 'Pointer',
                        className: className,
                        objectId: source.objectId,
                      },
                      key: field,
                    },
                    ...(where || {}),
                  },
                  parseOrder,
                  skip,
                  first,
                  after,
                  last,
                  before,
                  keys,
                  include,
                  false,
                  readPreference,
                  includeReadPreference,
                  subqueryReadPreference,
                  config,
                  auth,
                  info,
                  selectedFields,
                  parseGraphQLSchema.parseClasses.find(
                    parseClass =>
                      parseClass.className === source[field].className
                  ).fields
                );
              } catch (e) {
                parseGraphQLSchema.handleError(e);
              }
            },
          },
        };
      } else if (parseClass.fields[field].type === 'Polygon') {
        return {
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            type,
            async resolve(source) {
              if (source[field] && source[field].coordinates) {
                return source[field].coordinates.map(coordinate => ({
                  latitude: coordinate[0],
                  longitude: coordinate[1],
                }));
              } else {
                return null;
              }
            },
          },
        };
      } else if (parseClass.fields[field].type === 'Array') {
        return {
          ...fields,
          [field]: {
            description: `Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments`,
            type,
            async resolve(source) {
              if (!source[field]) return null;
              return source[field].map(async elem => {
                if (
                  elem.className &&
                  elem.objectId &&
                  elem.__type === 'Object'
                ) {
                  return elem;
                } else {
                  return { value: elem };
                }
              });
            },
          },
        };
      } else if (type) {
        return {
          ...fields,
          [field]: {
            description: `This is the object ${field}.`,
            type,
          },
        };
      } else {
        return fields;
      }
    }, parseObjectFields);
  };
  let classGraphQLOutputType = new GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${graphQLClassName} class.`,
    interfaces,
    fields: outputFields,
  });
  classGraphQLOutputType = parseGraphQLSchema.addGraphQLType(
    classGraphQLOutputType
  );

  const { connectionType, edgeType } = connectionDefinitions({
    name: graphQLClassName,
    connectionFields: {
      count: defaultGraphQLTypes.COUNT_ATT,
    },
    nodeType: classGraphQLOutputType || defaultGraphQLTypes.OBJECT,
  });
  let classGraphQLFindResultType = undefined;
  if (
    parseGraphQLSchema.addGraphQLType(edgeType) &&
    parseGraphQLSchema.addGraphQLType(connectionType, false, false, true)
  ) {
    classGraphQLFindResultType = connectionType;
  }

  parseGraphQLSchema.parseClassTypes[className] = {
    classGraphQLPointerType,
    classGraphQLRelationType,
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLConstraintType,
    classGraphQLConstraintsType,
    classGraphQLFindArgs,
    classGraphQLOutputType,
    classGraphQLFindResultType,
    config: {
      parseClassConfig,
      isCreateEnabled,
      isUpdateEnabled,
    },
  };

  if (className === '_User') {
    const viewerType = new GraphQLObjectType({
      name: 'Viewer',
      description: `The Viewer object type is used in operations that involve outputting the current user data.`,
      fields: () => ({
        sessionToken: defaultGraphQLTypes.SESSION_TOKEN_ATT,
        user: {
          description: 'This is the current user.',
          type: new GraphQLNonNull(classGraphQLOutputType),
        },
      }),
    });
    parseGraphQLSchema.addGraphQLType(viewerType, true, true);
    parseGraphQLSchema.viewerType = viewerType;
  }
};

export { extractKeysAndInclude, load };
