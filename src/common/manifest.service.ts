import { ConfigurationStorage, ConfigurationType } from './storage.service';
import { IManifest, ICascadeSettings } from './types';
import { CascadeValidationService } from './cascading.service';

type Validator = (manifest: IManifest) => Promise<null | IManifestValidationError>;

const ManifestMetadata = {
  availableVersions: [1],
};

enum ValidationErrorCode {
  SyntaxError,
  MissingRequiredProperty,
  InvalidVersion,
  InvalidCascadeType,
  InvalidCascadeConfiguration,
}

interface IManifestValidationError {
  code: ValidationErrorCode;
  description: string;
}

class ManifestService {
  private configurationStorage: ConfigurationStorage;
  private orgLevelConfigurationStorage: ConfigurationStorage;
  private projectId: string;

  public static defaultManifest: IManifest = Object.freeze({
    version: '1',
    cascades: {},
  });

  public constructor(projId: string = null) {
    this.projectId = projId;
    this.configurationStorage = new ConfigurationStorage(ConfigurationType.Manifest, this.projectId);
    this.orgLevelConfigurationStorage = new ConfigurationStorage(ConfigurationType.Manifest);
  }

  /*
  public async getManifest(): Promise<IManifest> {
    return this.configurationStorage.getConfiguration();
  }

  public async updateManifest(manifest: IManifest): Promise<IManifest> {
    return this.configurationStorage.setConfiguration(manifest);
  }
  */

  public async getConfigurationSettings(): Promise<ICascadeSettings> {
    // Handle if the configuration is stored for the project or for the org
    let settings: ICascadeSettings = await this.configurationStorage.getConfiguration();
    if(settings == null)
    {
      return this.orgLevelConfigurationStorage.getConfiguration();
    }
    else
    {
      if(settings.overrideOrgSettings == true)
      {
        return settings;
      }
      else
      {
        return this.orgLevelConfigurationStorage.getConfiguration();
      }
    }
  }

  public async updateConfigurationSettings(configurationSettings: ICascadeSettings): Promise<ICascadeSettings> {
    return this.configurationStorage.setConfiguration(configurationSettings);
  }
}

class ManifestValidationService {
  private validators: Validator[] = [this.checkVersion, this.checkCascadesType, this.checkCascades];
  private requiredProperties = ['version', 'cascades'];

  private cascadeValidator: CascadeValidationService;

  public constructor() {
    this.cascadeValidator = new CascadeValidationService();
  }

  public async validate(manifest: Object): Promise<null | IManifestValidationError[]> {
    const errors: IManifestValidationError[] = [];

    const error = await this.checkRequiredProperties(manifest, this.requiredProperties);
    if (error) {
      return [error];
    }

    for (let validator of this.validators) {
      const error = await validator.call(this, manifest);
      error ? errors.push(error) : null;
    }

    if (errors.length > 0) {
      return errors;
    }

    return null;
  }

  private async checkRequiredProperties(
    manifest: IManifest,
    requiredProperties: string[]
  ): Promise<null | IManifestValidationError> {
    const missingProperties: string[] = [];
    for (let property of requiredProperties) {
      if (!manifest.hasOwnProperty(property)) {
        missingProperties.push(property);
      }
    }
    if (missingProperties.length > 0) {
      return {
        code: ValidationErrorCode.MissingRequiredProperty,
        description: `Properties missing: ${missingProperties.join(', ')}`,
      };
    }
    return null;
  }

  private async checkVersion(manifest: IManifest): Promise<null | IManifestValidationError> {
    if (!ManifestMetadata.availableVersions.includes(Number(manifest.version))) {
      return {
        code: ValidationErrorCode.InvalidVersion,
        description: `Unknown version: ${manifest.version}`,
      };
    }
    return null;
  }

  private async checkCascadesType(manifest: IManifest): Promise<null | IManifestValidationError> {
    if (typeof manifest.cascades !== 'object') {
      return {
        code: ValidationErrorCode.InvalidCascadeType,
        description: `"cascades" should be an object, not ${typeof manifest.cascades}`,
      };
    }
    if (Array.isArray(manifest.cascades)) {
      return {
        code: ValidationErrorCode.InvalidCascadeType,
        description: '"cascades" should be an object, not an array',
      };
    }
    return null;
  }

  private async checkCascades(manifest: IManifest): Promise<null | IManifestValidationError> {
    const validator = this.cascadeValidator;
    const errors = await validator.validateCascades(manifest.cascades);

    if (errors && errors.length > 0) {
      return {
        code: ValidationErrorCode.InvalidCascadeConfiguration,
        description: `Invalid field refs: ${errors.join(', ')}`,
      };
    }
    return null;
  }
}

export {
  ManifestService,
  ManifestValidationService,
  IManifestValidationError,
  ValidationErrorCode,
};
