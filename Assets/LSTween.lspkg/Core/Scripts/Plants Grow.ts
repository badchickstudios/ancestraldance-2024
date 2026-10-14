import { LSTween } from "../../LSTween";
import Easing from "../../TweenJS/Easing";

@component
export class PlantGrowthController extends BaseScriptComponent {
  @input podsSmall1: SceneObject;
  @input podsSmall2: SceneObject;
  @input podsSmall3: SceneObject;
  @input flower2Blossom: SceneObject;
  @input grass0: SceneObject;
  @input grass1: SceneObject;
  @input grass2: SceneObject;
  @input grass3: SceneObject;
  @input grass4: SceneObject;
  @input leaves1: SceneObject;
  @input leaves2: SceneObject;
  @input leaves3: SceneObject;
  @input leaves4: SceneObject;
  @input roots1: SceneObject;
  @input roots2: SceneObject;
  @input roots3: SceneObject;
  @input roots4: SceneObject;
  @input tendril1: SceneObject;
  @input tendril2: SceneObject;
  @input tendril3: SceneObject;
  @input tendrilYoung1: SceneObject;
  @input tendrilYoung2: SceneObject;

  onAwake() {
    this.animateScale(this.podsSmall1, 15, 5000, 12000);
    this.animateScale(this.podsSmall2, 20, 4000, 9000);
    this.animateScale(this.podsSmall3, 25, 6000, 10000);
    this.animateScale(this.flower2Blossom, 15, 5000, 7500);
    this.animateScale(this.grass0, 15, 4000, 10000);
    this.animateScale(this.grass1, 20, 5000, 12500);
    this.animateScale(this.grass2, 10, 7000, 16500);
    this.animateScale(this.grass3, 20, 6000, 10900);
    this.animateScale(this.grass4, 20, 5000, 12200);
    this.animateScale(this.leaves1, 15, 4000, 14300);
    this.animateScale(this.leaves2, 15, 5000, 8200);
    this.animateScale(this.leaves3, 18, 6000, 16200);
    this.animateScale(this.leaves4, 10, 4000, 20200);
    this.animateScale(this.roots1, 15, 7000, 9200);
    this.animateScale(this.roots2, 15, 7000, 6200);
    this.animateScale(this.roots3, 15, 9000, 10200);
    this.animateScale(this.roots4, 15, 8000, 14200);
    this.animateScale(this.tendril1, 10, 6000, 18200);
    this.animateScale(this.tendril2, 10, 7000, 21200);
    this.animateScale(this.tendril3, 7, 8000, 20200);
    this.animateScale(this.tendrilYoung1, 15, 8000, 24200);
    this.animateScale(this.tendrilYoung2, 5, 9900, 147200);
  }

  private animateScale(target: SceneObject, size: number, duration: number, delay: number) {
    if (!target) return;
    const transform = target.getTransform();
    transform.setLocalScale(vec3.zero());

    LSTween.scaleToLocal(transform, new vec3(size, size, size), duration)
      .easing(Easing.Quadratic.InOut)
      .delay(delay)
      .start();
  }
}