import React, { Component, RefObject, ReactElement } from "react";
import "./style.scss";

export interface ImageAppProps {
    src?: string;
    imageData?: string;
    mimeType?: string;
    className?: string;
    alt?: string;
    autocomplete?: boolean;
    onComplete: () => void; // event called on completion
    fitMode?: 'height' | 'width';
}

interface ImageAppState {
    loading: boolean;
    image: HTMLImageElement;
}

const TICK = 150;
// ersatz Fibonacci sequence
const STEPS = [
    0.01,
    0.02,
    0.03,
    0.05,
    0.08,
    0.13,
    0.21,
    0.34,
    0.55,
    0.89,
    1.00,
];

class ImageApp extends Component<ImageAppProps, ImageAppState> {
    private _canvasRef: RefObject<HTMLCanvasElement | null>;
    private _animateTimerId: number | null = null;
    private _currentStep = 0;

    constructor(props: ImageAppProps) {
        super(props);

        this._canvasRef = React.createRef<HTMLCanvasElement | null>();
        const loading = !this.props.autocomplete;

        this.state = {
            loading,
            image: new Image(),
        };
    }

    public render(): ReactElement {
        const { className, fitMode = 'height' } = this.props;
        const { loading } = this.state;
        const css = ["image-app", className ? className : null, fitMode === "width" ? "fit-width" : "fit-height"].filter(Boolean).join(" ").trim();

        return (
            <div className={css}>
                {loading && <div className="progressbar" />}
                <canvas ref={this._canvasRef} />
            </div>
        );
    }

    public componentDidMount(): void {
        this._loadImage();
    }

    private _resampleImage(resolution: number): void {
        const { image } = this.state;
        const canvas = this._canvasRef.current;
        const ctx = canvas?.getContext("2d");

        if (!canvas || !ctx) return;

        const w = image.width;
        const h = image.height;

        const dw = w * resolution;
        const dh = h * resolution;

        // Clear the canvas to preserve transparency
        ctx.clearRect(0, 0, w, h);

        // Create a temporary canvas for the downsampled image
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = dw;
        tempCanvas.height = dh;
        const tempCtx = tempCanvas.getContext('2d');
        
        if (!tempCtx) return;

        // turn off smoothing to ensure it's pixelated
        tempCtx.imageSmoothingEnabled = false;
        ctx.imageSmoothingEnabled = false;
        
        // Draw the image at low resolution on temp canvas
        tempCtx.drawImage(image, 0, 0, dw, dh);
        
        // Draw the low-res image back at full size (pixelated effect)
        ctx.drawImage(tempCanvas, 0, 0, w, h);
    }

    private _clearAnimationTimer = () => {
        if (this._animateTimerId) {
            window.clearInterval(this._animateTimerId);
            this._animateTimerId = null;
        }
    };

    private _animate(): void {
        const { onComplete } = this.props;

        this._clearAnimationTimer();
        this._animateTimerId = window.setInterval(() => {
            if (this._currentStep < STEPS.length) {
                this._resampleImage(STEPS[this._currentStep]);
                this._currentStep++;
            } else {
                this._clearAnimationTimer();
                onComplete && onComplete();
            }
        }, TICK);
    }

    private _loadImage(): void {
        const { autocomplete, onComplete, src, imageData, mimeType } = this.props;
        const { image } = this.state;
        const canvas = this._canvasRef.current;
        const ctx = canvas?.getContext("2d");

        if (!ctx || !image || !canvas) return;

        image.onload = () => {
            // resize the canvas element
            const w = image.width;
            const h = image.height;

            // make sure dimensions are reasonable
            canvas.width = w;
            canvas.height = h;

            if (!autocomplete) {
                this.setState(
                    {
                        loading: false,
                    },
                    () => this._animate()
                );
            } else {
                ctx.drawImage(image, 0, 0);
                onComplete && onComplete();
            }
        };
        
        // Use base64 image data if available, otherwise use src
        if (imageData && mimeType) {
            image.src = `data:${mimeType};base64,${imageData}`;
        } else if (src) {
            image.src = src;
        }
    }
}

export default ImageApp;
