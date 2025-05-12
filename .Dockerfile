#Using the base lambda image with latest node
FROM public.ecr.aws/lambda/nodejs:20

#Pass the GITHUB_TOKEN during the docker build if there are dependencies on Bayshore libraries
ARG GITHUB_TOKEN

COPY DynatraceOneAgentExtension/ /opt/

RUN chmod +x /opt/dynatrace

# Copy the dependencies to the lamba root
COPY node_modules ${LAMBDA_TASK_ROOT}/
# Copy the build files from dist folder to the lambda root
COPY dist ${LAMBDA_TASK_ROOT}/
COPY config ${LAMBDA_TASK_ROOT}/config


# Set the CMD to your handler (could also be done as a parameter override outside of the Dockerfile)
CMD [ "index.handler" ]
