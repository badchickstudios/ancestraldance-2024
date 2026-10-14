import { LSTween } from "../../LSTween";
import Easing from "../../TweenJS/Easing";

@component
export class FireflyController extends BaseScriptComponent {
  @input ff1: SceneObject;
  @input ff2: SceneObject;
  @input ff3: SceneObject;
  @input ffGlow: MaterialMeshVisual;

  @input glow1: SceneObject;
  @input glow2: SceneObject;
  @input glow3: SceneObject;

  onAwake() {
    const ff1Transform = this.ff1.getTransform();
    const ff2Transform = this.ff2.getTransform();
    const ff3Transform = this.ff3.getTransform();
    const material = this.ffGlow.mainMaterial;

    // Start fireflies at scale 0
    ff1Transform.setLocalScale(vec3.zero());
    ff2Transform.setLocalScale(vec3.zero());
    ff3Transform.setLocalScale(vec3.zero());

    // Entry animations
    LSTween.scaleToLocal(ff1Transform, vec3.one(), 1000)
      .easing(Easing.Quadratic.InOut)
      .delay(0)
      .start();

    LSTween.scaleToLocal(ff2Transform, vec3.one(), 1000)
      .easing(Easing.Quadratic.InOut)
      .delay(2000)
      .start();

    LSTween.scaleToLocal(ff3Transform, vec3.one(), 1000)
      .easing(Easing.Quadratic.InOut)
      .delay(4000)
      .start();

    // Optional one-time glow fade
    LSTween.alphaFromTo(material, 0.0, 0.5, 1000).start();

    // Start glow scale loop (2 → 20 → 2)
    this.pingPongGlow(this.glow1.getTransform());
    this.pingPongGlow(this.glow2.getTransform());
    this.pingPongGlow(this.glow3.getTransform());

    // Start firefly hover animation (loop)
    this.pingPongHover(ff1Transform, new vec3(3, 0, 3), 4000);
    this.pingPongHover(ff2Transform, new vec3(-14, 3, 0), 4500);
    this.pingPongHover(ff3Transform, new vec3(6, 3, 1), 3000);
  }

  private pingPongGlow(transform: Transform) {
    const small = new vec3(2, 2, 2);
    const large = new vec3(20, 20, 20);
    const duration = 7000;

    const scaleUp = LSTween.scaleFromToLocal(transform, small, large, duration)
      .easing(Easing.Quadratic.InOut);

    const scaleDown = LSTween.scaleFromToLocal(transform, large, small, duration)
      .easing(Easing.Quadratic.InOut);

    scaleUp.chain(scaleDown);
    scaleDown.chain(scaleUp);

    scaleUp.start();
  }

  private pingPongHover(transform: Transform, offset: vec3, duration: number) {
    const start = transform.getLocalPosition();
    const end = start.add(offset);

    const moveOut = LSTween.moveFromToLocal(transform, start, end, duration)
      .easing(Easing.Quadratic.InOut);

    const moveBack = LSTween.moveFromToLocal(transform, end, start, duration)
      .easing(Easing.Quadratic.InOut);

    moveOut.chain(moveBack);
    moveBack.chain(moveOut);

    moveOut.start();
  }
}
