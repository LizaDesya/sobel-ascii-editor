#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-parameter"
#define STB_IMAGE_IMPLEMENTATION
#include "../include/stb_image.h"
#pragma GCC diagnostic pop

#include "../include/image.h"


image_t load_image(const char* file_path) {
    int width, height, channels;
    unsigned char* raw_data = stbi_load(file_path, &width, &height, &channels, 0);

    if (!raw_data) {
        fprintf(stderr, "Error: Failed to load image '%s': %s!\n", file_path, stbi_failure_reason());
        return (image_t) {0}; // Return empty image on failure
    }

    // Convert to [0., 1.]
    size_t total_size = (size_t) width * height * channels;
    double* data = calloc(total_size, sizeof(*data));
    if (!data) {
        fprintf(stderr, "Error: Failed to allocate memory for image data!\n");
        stbi_image_free(raw_data);
        return (image_t) {0}; // Return empty image on failure
    }

    for (size_t i = 0; i < total_size; i++) {
        data[i] = raw_data[i] / 255.0;
    }

    stbi_image_free(raw_data);

    return (image_t) {
        .width = (size_t) width,
        .height = (size_t) height,
        .channels = (size_t) channels,
        .data = data
    };
}


void free_image(image_t* image) {
    if (image && image->data) {
        free(image->data);
        image->data = NULL;
        image->width = image->height = image->channels = 0;
    }
}


// Gets pointer to pixel data at index (x, y)
double* get_pixel(image_t* image, size_t x, size_t y) {
    return &image->data[(y * image->width + x) * image->channels];
}


// Sets pixel channel values to those of new_pixel
void set_pixel(image_t* image, size_t x, size_t y, const double* new_pixel) {
    double* pixel = get_pixel(image, x, y);
    for (size_t c = 0; c < image->channels; c++) {
        pixel[c] = new_pixel[c];
    }
}


// Gets average pixel value in rectangular region; writes to `average`
void get_average(image_t* image, double* average, size_t x1, size_t x2, size_t y1, size_t y2) {
    // Set average to zero
    for (size_t c = 0; c < image->channels; c++) {
        average[c] = 0.0;
    }

    // Get total
    for (size_t y = y1; y < y2; y++) {
        for (size_t x = x1; x < x2; x++) {
            double* pixel = get_pixel(image, x, y);
            for (size_t c = 0; c < image->channels; c++) {
                average[c] += pixel[c];
            }
        }
    }

    // Divide by number of pixels in region
    double n_pixels = (double) (x2 - x1) * (y2 - y1);
    for (size_t c = 0; c < image->channels; c++) {
        average[c] /= n_pixels;
    }
}


image_t make_resized(image_t* original, size_t max_width, size_t max_height, double character_ratio) {
    size_t width, height;
    size_t channels = original->channels;

    // Note: Dividing heights by 2 for approximate terminal font aspect ratio
    size_t proposed_height = (original->height * max_width) / (character_ratio * original->width);
    if (proposed_height <= max_height) {
        width = max_width, height = proposed_height;
    } else {
        width = (character_ratio * original->width * max_height) / (original->height);
        height = max_height;
    }

    double* data = calloc(width * height * channels, sizeof(*data));
    if (!data) {
        fprintf(stderr, "Error: Failed to allocate memory for resized image!\n");
        return (image_t) {0};
    }

    // i, j are coordinates in resized image
    for (size_t j = 0; j < height; j++) {
        size_t y1 = (j * original->height) / (height);
        size_t y2 = ((j + 1) * original->height) / (height);
        for (size_t i = 0; i < width; i++) {
            size_t x1 = (i * original->width) / (width);
            size_t x2 = ((i + 1) * original->width) / (width);

            get_average(original, &data[(i + j * width) * channels], x1, x2, y1, y2);
        }
    }

    return (image_t) {
        .width = width,
        .height = height,
        .channels = channels,
        .data = data
    };
}


// Create grayscale version of image. Note: Assumes original is at least RGB.
image_t make_grayscale(image_t* original) {
    size_t width = original->width;
    size_t height = original->height;
    size_t channels = 1;

    double* data = calloc(width * height, sizeof(*data));
    if (!data) {
        fprintf(stderr, "Error: Failed to allocate memory for resized image!\n");
        return (image_t) {0};
    }

    image_t new = {
        .width = width,
        .height = height,
        .channels = channels,
        .data = data
    };

    for (size_t y = 0; y < height; y++) {
        for (size_t x = 0; x < width; x++) {
            double* pixel = get_pixel(original, x, y);
            double grayscale;
            if (original->channels == 1) {
                grayscale = pixel[0];  // Already grayscale
            } else if (original->channels >= 3) {
                // Luminance-weighted graycsale. Could be a callback...
                grayscale = 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
            } else {
                fprintf(stderr, "Unsupported channel count: %zu\n", original->channels);
                free(data);
                return (image_t){0};
            }

            set_pixel(&new, x, y, &grayscale);
        }
    }

    return new;
}


double calculate_convolution_value(image_t* image, double* kernel, size_t x, size_t y, size_t c) {
    double result = 0.0;

    for (int j = -1; j < 2; j++) {
        for (int i = -1; i < 2; i++) {
            size_t image_index = c + ((x + i) + (y + j) * image->width) * image->channels;
            size_t kernel_index = (i + 1) + (j + 1) * 3;

            result += kernel[kernel_index] * image->data[image_index];
        }
    }

    return result;
}


// Calculates convolution with 3x3 kernel. Ignores edges.
void get_convolution(image_t* image, double* kernel, double* out) {
    for (size_t y = 1; y < image->height - 1; y++) {
        for (size_t x = 1; x < image->width - 1; x++) {
            for (size_t c = 0; c < image->channels; c++) {
                size_t image_index = c + (x + y * image->width) * image->channels;
                out[image_index] = calculate_convolution_value(image, kernel, x, y, c);
            }
        }
    }
}


// Calculates sobel convolutions
void get_sobel(image_t* image, double* out_x, double* out_y) {
    double Gx[] = {-1., 0., 1., -2., 0., 2., -1., 0., 1};
    double Gy[] = {1., 2., 1., 0., 0., 0., -1., -2., -1};

    get_convolution(image, Gx, out_x);
    get_convolution(image, Gy, out_y);
}
