import { ChalanSelfModelService } from './chalan-self-model.service';

describe('ChalanSelfModelService', () => {
  it('anchors Chalán on usefulness for busy independent workers', () => {
    expect(ChalanSelfModelService.mission).toBe(
      'Ser útil al trabajador independiente cuando está demasiado ocupado trabajando para administrar su propio negocio.',
    );
    expect(ChalanSelfModelService.operatingPrinciple).toContain(
      'pendiente -> recordatorio -> acción -> seguimiento -> resultado registrado',
    );
  });

  it('separates live capabilities from planned and unsupported ones', () => {
    const section = ChalanSelfModelService.buildSystemSection();

    expect(section).toContain('agenda de trabajos y citas');
    expect(section).toContain('recordatorios por WhatsApp');
    expect(section).toContain('llamadas de voz automatizadas');
    expect(section).toContain('NO prometer como disponibles');
    expect(section).toContain('capital bancario total');
  });
});
