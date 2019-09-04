import { AmplitudeEnvelope } from "../component/envelope/AmplitudeEnvelope";
import { Envelope, EnvelopeOptions } from "../component/envelope/Envelope";
import { ToneAudioNode, ToneAudioNodeOptions } from "../core/context/ToneAudioNode";
import { Cents, Frequency, Seconds } from "../core/type/Units";
import { omitFromObject, optionsFromArguments } from "../core/util/Defaults";
import { readOnly } from "../core/util/Interface";
import { RecursivePartial } from "../core/util/Interface";
import { Signal } from "../signal/Signal";
import { OmniOscillator } from "../source/oscillator/OmniOscillator";
import { OmniOscillatorConstructorOptions, OmniOscillatorSynthOptions } from "../source/oscillator/OscillatorInterface";
import { Source, SourceOptions } from "../source/Source";
import { Monophonic, MonophonicOptions } from "./Monophonic";

export interface SynthOptions extends MonophonicOptions {
	oscillator: OmniOscillatorSynthOptions;
	envelope: Omit<EnvelopeOptions, keyof ToneAudioNodeOptions>;
}

/**
 * Synth is composed simply of a {@link OmniOscillator} routed through an {@link AmplitudeEnvelope}.
 * ```
 * +----------------+   +-------------------+
 * | OmniOscillator +>--> AmplitudeEnvelope +>--> Output
 * +----------------+   +-------------------+
 * ```
 * @example
 * var synth = new Synth().toDestination();
 * synth.triggerAttackRelease("C4", "8n");
 */
export class Synth<Options extends SynthOptions = SynthOptions> extends Monophonic<Options> {

	readonly name: string = "Synth";

	/**
	 *  The oscillator.
	 */
	readonly oscillator: OmniOscillator<any>;

	/**
	 * The frequency signal
	 */
	readonly frequency: Signal<Frequency>;

	/**
	 * The detune signal
	 */
	readonly detune: Signal<Cents>;

	/**
	 * The envelope
	 */
	readonly envelope: AmplitudeEnvelope;

	/**
	 * @param options the options available for the synth.
	 */
	constructor(options?: RecursivePartial<SynthOptions>);
	constructor() {
		super(optionsFromArguments(Synth.getDefaults(), arguments));
		const options = optionsFromArguments(Synth.getDefaults(), arguments);

		this.oscillator = new OmniOscillator(Object.assign({
			context: this.context,
			onstop: () => this.onsilence(this),
		}, options.oscillator));

		this.frequency = this.oscillator.frequency;
		this.detune = this.oscillator.detune;

		this.envelope = new AmplitudeEnvelope(Object.assign({
			context: this.context,
		}, options.envelope));

		// connect the oscillators to the output
		this.oscillator.chain(this.envelope, this.output);
		readOnly(this, ["oscillator", "frequency", "detune", "envelope"]);
	}

	static getDefaults(): SynthOptions {
		return Object.assign(Monophonic.getDefaults(), {
			envelope: Object.assign(
				omitFromObject(Envelope.getDefaults(), Object.keys(ToneAudioNode.getDefaults())),
				{
					attack : 0.005,
					decay : 0.1,
					release : 1,
					sustain : 0.3,
				},
			),
			oscillator: Object.assign(
				omitFromObject(OmniOscillator.getDefaults(), [...Object.keys(Source.getDefaults()), "frequency", "detune"]),
				{
					type: "triangle",
				},
			),
		});
	}

	/**
	 *  start the attack portion of the envelope
	 * @param time the time the attack should start
	 * @param velocity the velocity of the note (0-1)
	 */
	protected _triggerEnvelopeAttack(time: Seconds, velocity: number): void {
		// the envelopes
		this.envelope.triggerAttack(time, velocity);
		this.oscillator.start(time);
		// if there is no release portion, stop the oscillator
		if (this.envelope.sustain === 0) {
			const computedAttack = this.toSeconds(this.envelope.attack);
			const computedDecay = this.toSeconds(this.envelope.decay);
			this.oscillator.stop(time + computedAttack + computedDecay);
		}
	}

	/**
	 *  start the release portion of the envelope
	 * @param time the time the release should start
	 */
	protected _triggerEnvelopeRelease(time: Seconds): void {
		this.envelope.triggerRelease(time);
		this.oscillator.stop(time + this.toSeconds(this.envelope.release));
	}

	/**
	 *  clean up
	 */
	dispose(): this {
		super.dispose();
		this.oscillator.dispose();
		this.envelope.dispose();
		return this;
	}
}